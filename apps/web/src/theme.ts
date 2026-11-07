import { Badge, Button, createTheme, type MantineColorsTuple, Paper } from "@mantine/core";

/** Road-sign blue from the logo. Index 6 is the brand colour (#1E5BD8). */
const blue: MantineColorsTuple = [
  "#EAF1FF",
  "#D3E1FF",
  "#A8C3FB",
  "#7BA3F7",
  "#4F86F3",
  "#2F6FEA",
  "#1E5BD8",
  "#1749B0",
  "#0F3688",
  "#0B2A6B",
];

export const theme = createTheme({
  primaryColor: "blue",
  primaryShade: { light: 6, dark: 5 },
  colors: { blue },
  fontFamily: '"Manrope", system-ui, -apple-system, "Segoe UI", sans-serif',
  headings: { fontFamily: '"Fredoka", "Manrope", system-ui, sans-serif', fontWeight: "600" },
  defaultRadius: "md",
  radius: { xs: "6px", sm: "10px", md: "14px", lg: "18px", xl: "24px" },
  components: {
    Paper: Paper.extend({ classNames: { root: "sim-sticker" } }),
    Button: Button.extend({ classNames: { root: "sim-btn" } }),
    Badge: Badge.extend({ classNames: { root: "sim-badge" } }),
  },
});
