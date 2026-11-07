import { Button, Center, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { useAuth } from "../data/auth";
import { useT } from "../i18n";

/** Shown once, right after a fresh account is claimed, to give it a display name. */
export function NamePage() {
  const t = useT();
  const { setName, skipName } = useAuth();
  const [name, setName_] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (value: string) => {
    setBusy(true);
    await setName(value.trim());
    setBusy(false);
  };

  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder p="lg" radius="lg" w={380} maw="100%">
        <Stack gap="md">
          <Stack gap={6}>
            <Title order={2} className="sim-display">
              {t.name.title}
            </Title>
            <Text size="sm" c="dimmed">
              {t.name.subtitle}
            </Text>
          </Stack>
          <TextInput
            label={t.name.label}
            placeholder={t.name.placeholder}
            value={name}
            onChange={(e) => setName_(e.currentTarget.value)}
            autoFocus
            maxLength={60}
            data-testid="name-input"
          />
          <Button loading={busy} disabled={!name.trim()} onClick={() => void save(name)} fullWidth>
            {t.name.save}
          </Button>
          <Button variant="subtle" color="gray" onClick={skipName}>
            {t.name.skip}
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
