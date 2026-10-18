import { Button, Group, NumberInput, Paper, Stack, Switch, Text, Title } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { db, getMeta } from "../data/db";
import { useLearner, useSyncState } from "../data/learner";
import { syncNow } from "../data/sync";
import { saveSettings } from "../data/writes";

export function SettingsPage() {
  const { settings, pendingCount } = useLearner();
  const sync = useSyncState();
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    void getMeta(db, "deviceId", "").then(setDeviceId);
  }, []);

  const update = (patch: Partial<typeof settings>) =>
    void saveSettings(db, { ...settings, ...patch });

  return (
    <Stack gap="lg">
      <Title order={2}>Settings</Title>
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <NumberInput
            label="New questions per day"
            description="Train introduces at most this many questions you have never seen."
            min={0}
            max={100}
            value={settings.newPerDay}
            onChange={(v) => typeof v === "number" && update({ newPerDay: v })}
          />
          <NumberInput
            label="Questions per round"
            min={3}
            max={50}
            value={settings.sessionSize}
            onChange={(v) => typeof v === "number" && update({ sessionSize: v })}
          />
          <Switch
            label="Move on by itself after a right answer"
            checked={settings.autoAdvance}
            onChange={(e) => update({ autoAdvance: e.currentTarget.checked })}
          />
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600}>Sync</Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconRefresh size={16} />}
              loading={sync.state === "syncing"}
              onClick={() => void syncNow(db)}
            >
              Sync now
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            {pendingCount} answers waiting to upload.{" "}
            {sync.state === "error" ? `Last attempt failed: ${sync.error}.` : null}
            {sync.lastOkAt ? ` Last synced ${new Date(sync.lastOkAt).toLocaleTimeString()}.` : null}
          </Text>
          <Text size="xs" c="dimmed">
            This device: {deviceId || "(not used yet)"}
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
}
