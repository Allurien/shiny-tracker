// Landing route for the OAuth deep link `shinybook://auth/callback`.
// On Android the Custom Tab usually returns the result inline, but when it
// can't, the OS launches the app via this deep link instead. The auth
// provider's useAuthRequest listener picks up the URL params and runs the
// code exchange — this screen just holds a spinner until status flips.

import { ActivityIndicator, View } from "react-native";

import { palette } from "@/src/theme/colors";

export default function AuthCallbackScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: palette.bg,
      }}
    >
      <ActivityIndicator color={palette.teal} size="large" />
    </View>
  );
}
