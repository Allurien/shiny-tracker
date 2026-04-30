import { Redirect } from "expo-router";

// Root → tabs landing.
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
