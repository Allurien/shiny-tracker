/// <reference path="./.sst/platform/config.d.ts" />

// ShinyBook AWS infrastructure. One SST app wraps:
//   - Cognito User Pool (federated Google sign-in)
//   - DynamoDB single-table for paintings/drills/sessions
//   - S3 bucket for progress photos
//   - API Gateway HTTP API with Cognito JWT authorizer
//   - Lambda handlers (Node 20, ESM)
//   - Route 53 hosted zone for allurien.dev
//   - ACM cert covering *.allurien.dev (us-east-1 because CloudFront needs it there)
//   - CloudFront-backed static site for the Expo web export

export default $config({
  app(input) {
    return {
      name: "shinybook",
      home: "aws",
      removal: input?.stage === "production" ? "retain" : "remove",
      providers: {
        aws: { region: "us-east-1" },
      },
    };
  },

  async run() {
    const stage = $app.stage;
    const isProd = stage === "production";

    // ---------- Secrets ----------
    // Run once locally:  npx sst secret set GoogleClientId ...
    //                    npx sst secret set GoogleClientSecret ...
    const googleClientId = new sst.Secret("GoogleClientId");
    const googleClientSecret = new sst.Secret("GoogleClientSecret");

    // ---------- DynamoDB ----------
    // Single-table design:
    //   pk = USER#<sub>, sk = PAINTING#<id> | DRILL#<id> | SESSION#<id>
    //   gsi1 (sync cursor): gsi1pk = USER#<sub>#PAINTING (or DRILL, SESSION),
    //                       gsi1sk = <updatedAt>#<id>
    //   gsi2 (drill natural key lookup for upsert):
    //                       gsi2pk = USER#<sub>#DRILL-NK,
    //                       gsi2sk = <brand>#<drillNumber>
    const table = new sst.aws.Dynamo("Data", {
      fields: {
        pk: "string",
        sk: "string",
        gsi1pk: "string",
        gsi1sk: "string",
        gsi2pk: "string",
        gsi2sk: "string",
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      globalIndexes: {
        "gsi1-updated": { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
        "gsi2-drill-nk": { hashKey: "gsi2pk", rangeKey: "gsi2sk" },
      },
    });

    // ---------- S3 for photos ----------
    // Objects are keyed as <sub>/<paintingId>/<uuid>.<ext>. Bucket is private;
    // clients get pre-signed PUTs for upload and pre-signed GETs for viewing
    // (we could also front it with CloudFront later for cached reads).
    const photos = new sst.aws.Bucket("Photos", {
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: ["GET", "PUT", "HEAD"],
          allowedOrigins: ["*"], // tightened via API → pre-signed URLs, not raw CORS
          exposeHeaders: ["ETag"],
          maxAge: "3000 seconds",
        },
      ],
    });

    // ---------- Cognito ----------
    const userPool = new sst.aws.CognitoUserPool("Users", {
      usernames: ["email"],
    });

    userPool.addIdentityProvider("Google", {
      type: "google",
      details: {
        client_id: googleClientId.value,
        client_secret: googleClientSecret.value,
        authorize_scopes: "openid email profile",
      },
      attributes: {
        email: "email",
        name: "name",
      },
    });

    const userPoolClient = userPool.addClient("Client", {
      transform: {
        client: {
          supportedIdentityProviders: ["Google"],
          callbackUrls: isProd
            ? ["https://shinybook.allurien.dev/auth/callback", "shinybook://auth/callback"]
            : [
                "http://localhost:8081/auth/callback",
                "https://shinybook.allurien.dev/auth/callback",
                "shinybook://auth/callback",
              ],
          logoutUrls: isProd
            ? ["https://shinybook.allurien.dev/", "shinybook://"]
            : [
                "http://localhost:8081/",
                "https://shinybook.allurien.dev/",
                "shinybook://",
              ],
          allowedOauthFlows: ["code"],
          allowedOauthScopes: ["openid", "email", "profile"],
          allowedOauthFlowsUserPoolClient: true,
          generateSecret: false, // public client (Expo app)
        },
      },
    });

    // Hosted-UI domain: https://<prefix>.auth.us-east-1.amazoncognito.com
    // Prefix must be globally unique; bump the suffix if taken.
    const cognitoDomainPrefix = `shinybook-${stage}`;
    const cognitoDomain = new aws.cognito.UserPoolDomain("AuthDomain", {
      domain: cognitoDomainPrefix,
      userPoolId: userPool.id,
    });

    // ---------- Route 53 hosted zone ----------
    // After this zone is created, update nameservers at name.com (see SETUP.md)
    // so DNS delegation takes effect.
    const zone = new aws.route53.Zone("Zone", { name: "allurien.dev" });

    // ---------- ACM cert (us-east-1 — required for CloudFront) ----------
    const cert = new aws.acm.Certificate("Cert", {
      domainName: "allurien.dev",
      subjectAlternativeNames: ["*.allurien.dev"],
      validationMethod: "DNS",
    });

    // ACM returns the same validation CNAME for the apex and the wildcard,
    // so dedupe by record name before creating Route 53 records.
    const certValidationRecords = cert.domainValidationOptions.apply((opts) => {
      const seen = new Set<string>();
      const unique = opts.filter((opt) => {
        if (seen.has(opt.resourceRecordName)) return false;
        seen.add(opt.resourceRecordName);
        return true;
      });
      return unique.map(
        (opt, i) =>
          new aws.route53.Record(`CertValidation${i}`, {
            name: opt.resourceRecordName,
            type: opt.resourceRecordType,
            zoneId: zone.zoneId,
            records: [opt.resourceRecordValue],
            ttl: 60,
          }),
      );
    });

    const certValidation = new aws.acm.CertificateValidation("CertValidation", {
      certificateArn: cert.arn,
      validationRecordFqdns: certValidationRecords.apply((records) =>
        records.map((r) => r.fqdn),
      ),
    });

    // ---------- API ----------
    const api = new sst.aws.ApiGatewayV2("Api", {
      domain: {
        name: "api.allurien.dev",
        dns: sst.aws.dns({ zone: zone.zoneId }),
      },
    });

    const cognitoAuthorizer = api.addAuthorizer({
      name: "CognitoJwt",
      jwt: {
        issuer: $interpolate`https://cognito-idp.us-east-1.amazonaws.com/${userPool.id}`,
        audiences: [userPoolClient.id],
      },
    });

    const handler = (fn: string) => ({
      handler: `apps/api/src/handlers/${fn}`,
      link: [table, photos],
      environment: {
        TABLE_NAME: table.name,
        PHOTOS_BUCKET: photos.name,
        STAGE: stage,
      },
    });
    const protectedRoute = {
      auth: { jwt: { authorizer: cognitoAuthorizer.id } },
    };

    // Paintings
    api.route("GET /paintings", handler("paintings.list"), protectedRoute);
    api.route("POST /paintings", handler("paintings.create"), protectedRoute);
    api.route("GET /paintings/{id}", handler("paintings.get"), protectedRoute);
    api.route("PATCH /paintings/{id}", handler("paintings.update"), protectedRoute);
    api.route("DELETE /paintings/{id}", handler("paintings.remove"), protectedRoute);

    // Drills
    api.route("GET /drills", handler("drills.list"), protectedRoute);
    api.route("POST /drills", handler("drills.create"), protectedRoute);
    api.route("POST /drills/upsert", handler("drills.upsert"), protectedRoute);
    api.route("GET /drills/{id}", handler("drills.get"), protectedRoute);
    api.route("PATCH /drills/{id}", handler("drills.update"), protectedRoute);
    api.route("DELETE /drills/{id}", handler("drills.remove"), protectedRoute);

    // Sessions
    api.route("GET /sessions", handler("sessions.list"), protectedRoute);
    api.route("POST /sessions", handler("sessions.create"), protectedRoute);
    api.route("PATCH /sessions/{id}", handler("sessions.update"), protectedRoute);
    api.route("DELETE /sessions/{id}", handler("sessions.remove"), protectedRoute);

    // Photos
    api.route("POST /photos/sign-upload", handler("photos.signUpload"), protectedRoute);
    api.route("POST /photos/sign-view", handler("photos.signView"), protectedRoute);

    // Sync — "give me everything updated since X for entity Y"
    api.route("GET /sync", handler("sync.changes"), protectedRoute);

    // Wishlist sources — DAC share URLs the user pasted at import time.
    // Stored so the wishlist tab can re-scrape the same URL on demand and
    // diff against current paintings to surface adds/removals.
    api.route(
      "GET /wishlist-sources",
      handler("wishlistSources.list"),
      protectedRoute,
    );
    api.route(
      "POST /wishlist-sources",
      handler("wishlistSources.put"),
      protectedRoute,
    );
    api.route(
      "GET /wishlist-sources/{id}",
      handler("wishlistSources.get"),
      protectedRoute,
    );
    api.route(
      "PATCH /wishlist-sources/{id}",
      handler("wishlistSources.patch"),
      protectedRoute,
    );
    api.route(
      "DELETE /wishlist-sources/{id}",
      handler("wishlistSources.remove"),
      protectedRoute,
    );

    // Restock subscription (push notifications). The bot reads these rows
    // directly out of DynamoDB when it detects new restocks.
    api.route(
      "GET /restock-subscription",
      handler("restockSubscription.get"),
      protectedRoute,
    );
    api.route(
      "POST /restock-subscription",
      handler("restockSubscription.put"),
      protectedRoute,
    );
    api.route(
      "DELETE /restock-subscription",
      handler("restockSubscription.remove"),
      protectedRoute,
    );

    // ---------- Static site (Expo web export) ----------
    // Expo Router's static export emits per-route HTML at <route>.html (e.g.
    // /auth/callback → /auth/callback.html). Without a rewrite, deep links
    // like the OAuth callback hit S3 with the bare path and get AccessDenied.
    // SST's default router tries .html postfixes via KV lookup, but only when
    // the KV has an entry — on a stale deploy or KV miss it falls back to
    // forwarding the bare URI. The injection here runs before the default
    // router and unconditionally appends .html for any extensionless path.
    const site = new sst.aws.StaticSite("Web", {
      path: "apps/shinybook",
      build: {
        command: "npx expo export --platform web --output-dir dist",
        output: "dist",
      },
      domain: {
        name: "shinybook.allurien.dev",
        dns: sst.aws.dns({ zone: zone.zoneId }),
      },
      edge: {
        viewerRequest: {
          injection: `
            var uri = event.request.uri;
            if (uri && !uri.endsWith('/')) {
              var last = uri.split('/').pop();
              if (last && last.indexOf('.') === -1) {
                event.request.uri = uri + '.html';
              }
            }
          `,
        },
      },
      environment: {
        EXPO_PUBLIC_API_URL: api.url,
        EXPO_PUBLIC_USER_POOL_ID: userPool.id,
        EXPO_PUBLIC_USER_POOL_CLIENT_ID: userPoolClient.id,
        EXPO_PUBLIC_COGNITO_DOMAIN: $interpolate`${cognitoDomain.domain}.auth.us-east-1.amazoncognito.com`,
        EXPO_PUBLIC_PHOTOS_BUCKET: photos.name,
      },
    });

    return {
      apiUrl: api.url,
      siteUrl: site.url,
      userPoolId: userPool.id,
      userPoolClientId: userPoolClient.id,
      cognitoDomain: $interpolate`${cognitoDomain.domain}.auth.us-east-1.amazoncognito.com`,
      photosBucket: photos.name,
      // Nameservers you'll set at name.com to delegate DNS to Route 53.
      zoneNameservers: zone.nameServers,
      // Wait for cert validation to finish before publishing any consumers.
      certArn: certValidation.certificateArn,
    };
  },
});
