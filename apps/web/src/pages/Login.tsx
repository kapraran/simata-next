import { Button, Center, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconKey } from "@tabler/icons-react";
import { type FormEvent, useState } from "react";
import { LogoMark } from "../components/Signs";
import { useAuth } from "../data/auth";
import { useT } from "../i18n";

/** Where someone pastes the account key from their claim link. */
export function LoginPage() {
  const t = useT();
  const { login, claimError } = useAuth();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = error ?? (claimError ? t.login.errors[claimError] : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    const r = await login(key.trim());
    setBusy(false);
    if (!r.ok) setError(t.login.errors[r.error]);
  };

  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder p="lg" radius="lg" w={380} maw="100%">
        <form onSubmit={submit}>
          <Stack gap="md">
            <Stack gap={6} align="center">
              <LogoMark size={56} />
              <Title order={2} className="sim-display">
                {t.login.title}
              </Title>
              <Text size="sm" c="dimmed" ta="center">
                {t.login.subtitle}
              </Text>
            </Stack>
            <TextInput
              label={t.login.keyLabel}
              placeholder={t.login.keyPlaceholder}
              leftSection={<IconKey size={16} />}
              value={key}
              onChange={(e) => setKey(e.currentTarget.value)}
              autoFocus
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              data-testid="login-key"
            />
            {shown && (
              <Text size="sm" c="red" data-testid="login-error">
                {shown}
              </Text>
            )}
            <Button type="submit" loading={busy} disabled={!key.trim()} fullWidth>
              {t.login.submit}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
