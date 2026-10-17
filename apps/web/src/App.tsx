import { AppShell, Badge, Container, Group, Stack, Text, Title } from "@mantine/core";
import { IconCircleCheck, IconPlugConnectedX, IconSteeringWheel } from "@tabler/icons-react";
import { useEffect, useState } from "react";

type ApiState = "checking" | "ok" | "down";

export function App() {
  const [api, setApi] = useState<ApiState>("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => setApi(r.ok ? "ok" : "down"))
      .catch(() => setApi("down"));
  }, []);

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" gap="xs">
          <IconSteeringWheel size={24} />
          <Title order={4}>Simata</Title>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xs">
          <Stack gap="sm" mt="xl">
            <Text c="dimmed">Scaffold is up. Quiz comes later.</Text>
            <Badge
              data-testid="api-status"
              color={api === "ok" ? "green" : api === "down" ? "red" : "gray"}
              leftSection={
                api === "down" ? <IconPlugConnectedX size={14} /> : <IconCircleCheck size={14} />
              }
            >
              API: {api}
            </Badge>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
