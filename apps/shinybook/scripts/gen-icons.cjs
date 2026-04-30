// One-shot: render ShinyBook sparkle icon into the PNG assets expo expects.
// Run from apps/shinybook: node scripts/gen-icons.cjs
// Requires sharp — install with: npm install --no-save sharp

const sharp = require("sharp");
const path = require("path");

const IMG_DIR = path.join(__dirname, "..", "assets", "images");
const BLUE = "#5A8DEE";
const DARK_BG = "#0F0E1F";
const PATH_D =
  "m75.52 55.121c0 0.55078-0.39062 1.0195-0.92969 1.1211-11.219 2.1094-19.828 10.73-21.941 21.949-0.10156 0.53906-0.57031 0.92969-1.1211 0.92969-0.55078 0-1.0195-0.39062-1.1211-0.92969-2.1094-11.219-10.73-19.828-21.949-21.949-0.53906-0.10156-0.92969-0.57031-0.92969-1.1211 0-0.55078 0.39062-1.0195 0.92969-1.1211 11.219-2.1094 19.828-10.73 21.949-21.949 0.10156-0.53906 0.57031-0.92969 1.1211-0.92969 0.55078 0 1.0195 0.39062 1.1211 0.92969 2.1094 11.219 10.719 19.828 21.941 21.949 0.53906 0.10156 0.92969 0.57031 0.92969 1.1211zm-1.8008 27.957c-2.8008-0.53125-4.9609-2.6797-5.4883-5.4883-0.050781-0.26953-0.51172-0.26953-0.55859 0-0.53125 2.8008-2.6797 4.9609-5.4883 5.4883-0.12891 0.03125-0.23047 0.14062-0.23047 0.28125s0.10156 0.26172 0.23047 0.28125c2.8086 0.53125 4.9609 2.6797 5.4883 5.4883 0.03125 0.14062 0.14062 0.23047 0.28125 0.23047s0.25-0.10156 0.28125-0.23047c0.53125-2.8008 2.6797-4.9609 5.4883-5.4883 0.12891-0.03125 0.23047-0.14062 0.23047-0.28125s-0.10156-0.26172-0.23047-0.28125zm-40.609-47.969c-0.03125-0.14844-0.28906-0.14844-0.32031 0-0.30078 1.5781-1.5117 2.7891-3.0781 3.0898-0.078126 0.011719-0.12891 0.078125-0.12891 0.16016 0 0.078125 0.058594 0.14062 0.12891 0.16016 1.5781 0.30078 2.7891 1.5117 3.0781 3.0898 0.011719 0.078125 0.078126 0.12891 0.16016 0.12891 0.078125 0 0.14062-0.050781 0.16016-0.12891 0.30078-1.5781 1.5117-2.7891 3.0898-3.0898 0.078125-0.011719 0.12891-0.078125 0.12891-0.16016 0-0.078125-0.058594-0.14062-0.12891-0.16016-1.5781-0.30078-2.7891-1.5117-3.0898-3.0898zm-10.121 33.582s-0.058593-0.03125-0.070312 0c-0.070313 0.35156-0.33984 0.62891-0.69141 0.69141-0.019531 0-0.03125 0.019532-0.03125 0.039063s0.011719 0.03125 0.03125 0.039063c0.35938 0.070312 0.62891 0.33984 0.69141 0.69141 0 0.019531 0.019531 0.03125 0.039062 0.03125s0.03125-0.011719 0.039063-0.03125c0.070312-0.35938 0.33984-0.62891 0.69922-0.69141 0.019532 0 0.03125-0.019532 0.03125-0.039063s-0.011718-0.03125-0.03125-0.039063c-0.35937-0.070312-0.62891-0.33984-0.69922-0.69141zm54.352-46.613c-5.6094-1.0586-9.9219-5.3594-10.969-10.969-0.050782-0.26953-0.28906-0.46875-0.55859-0.46875s-0.51172 0.19922-0.55859 0.46875c-1.0586 5.6094-5.3594 9.9219-10.969 10.969-0.26953 0.050781-0.46875 0.28906-0.46875 0.55859s0.19922 0.51172 0.46875 0.55859c5.6094 1.0586 9.9219 5.3594 10.969 10.969 0.050782 0.26953 0.28906 0.46875 0.55859 0.46875s0.51172-0.19922 0.55859-0.46875c1.0586-5.6094 5.3594-9.9219 10.969-10.969 0.26953-0.050781 0.46875-0.28906 0.46875-0.55859s-0.19922-0.51172-0.46875-0.55859z";

function sparkleSvgBuffer(color) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -10 110 110"><path fill="${color}" d="${PATH_D}"/></svg>`,
  );
}

async function renderOn(color, size, paddingRatio) {
  const inner = Math.round(size * (1 - paddingRatio * 2));
  const sparkle = await sharp(sparkleSvgBuffer(color), { density: 600 })
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: sparkle, gravity: "center" }]);
}

async function main() {
  // icon.png — opaque dark bg, 1024x1024 (iOS app icon; strip alpha channel)
  {
    const img = await renderOn(BLUE, 1024, 0.15);
    await img
      .flatten({ background: DARK_BG })
      .removeAlpha()
      .png()
      .toFile(path.join(IMG_DIR, "icon.png"));
  }
  // favicon.png — 48x48 transparent
  {
    const img = await renderOn(BLUE, 48, 0.08);
    await img.png().toFile(path.join(IMG_DIR, "favicon.png"));
  }
  // splash-icon.png — 1024x1024 transparent (expo-splash-screen imageWidth=200)
  {
    const img = await renderOn(BLUE, 1024, 0.1);
    await img.png().toFile(path.join(IMG_DIR, "splash-icon.png"));
  }
  // android-icon-foreground.png — 512x512 transparent, larger safe zone
  {
    const img = await renderOn(BLUE, 512, 0.22);
    await img.png().toFile(path.join(IMG_DIR, "android-icon-foreground.png"));
  }
  // android-icon-monochrome.png — 432x432, black glyph (Android themed icons)
  {
    const img = await renderOn("#000000", 432, 0.22);
    await img.png().toFile(path.join(IMG_DIR, "android-icon-monochrome.png"));
  }
  console.log("wrote icons to", IMG_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
