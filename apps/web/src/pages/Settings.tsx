import {
  Button,
  Group,
  type MantineColorScheme,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import { IconCopy, IconLogout, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useAuth } from "../data/auth";
import { deleteDb, getMeta } from "../data/db";
import { useLearner, useSyncState } from "../data/learner";
import { clearLog, formatLog, log, logCount } from "../data/log";
import { syncNow } from "../data/sync";
import { saveSettings } from "../data/writes";
import { LANGS, type Lang, type LangPref, useI18n, useT } from "../i18n";

/** Each language is named in itself, so it is recognisable whatever the current UI language. */
const LANGUAGE_NAMES: Record<Lang, string> = { en: "English", el: "Ελληνικά" };

export function SettingsPage() {
  const t = useT();
  const { pref, setLang } = useI18n();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { settings, pendingCount, db } = useLearner();
  const { user, setName, logout } = useAuth();
  const sync = useSyncState();
  const [deviceId, setDeviceId] = useState("");
  const [entries, setEntries] = useState(0);
  const [copied, setCopied] = useState(false);
  const [name, setNameInput] = useState(user?.name ?? "");
  const [savedName, setSavedName] = useState(user?.name ?? "");

  useEffect(() => {
    void getMeta(db, "deviceId", "").then(setDeviceId);
    setEntries(logCount());
  }, [db]);

  const copyLog = async () => {
    await navigator.clipboard.writeText(formatLog());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const wipeLog = () => {
    clearLog();
    log("app", "log cleared");
    setEntries(logCount());
  };

  const update = (patch: Partial<typeof settings>) =>
    void saveSettings(db, { ...settings, ...patch });

  const saveName = async () => {
    const trimmed = name.trim();
    await setName(trimmed);
    setSavedName(trimmed);
  };

  const removeFromDevice = async () => {
    if (!user) return;
    if (!confirm(t.settings.removeConfirm)) return;
    await logout();
    await deleteDb(user.id);
  };

  return (
    <Stack gap="lg">
      <Title order={2}>{t.settings.title}</Title>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600}>{t.settings.account}</Text>
          <TextInput
            label={t.settings.displayName}
            placeholder={t.settings.displayNamePlaceholder}
            value={name}
            onChange={(e) => setNameInput(e.currentTarget.value)}
            maxLength={60}
            rightSection={
              <Button
                size="compact-xs"
                variant="light"
                disabled={name.trim() === savedName}
                onClick={() => void saveName()}
              >
                {t.settings.save}
              </Button>
            }
            rightSectionWidth={70}
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {t.settings.accountId(user?.id ?? "")}
            </Text>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconLogout size={16} />}
              onClick={() => void logout()}
            >
              {t.settings.signOut}
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Select
            label={t.settings.language}
            data={[
              { value: "system", label: t.settings.languageSystem },
              ...LANGS.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
            ]}
            value={pref}
            onChange={(v) => v && setLang(v as LangPref)}
            allowDeselect={false}
          />
          <Select
            label={t.settings.theme}
            data={[
              { value: "auto", label: t.settings.themeSystem },
              { value: "light", label: t.settings.themeLight },
              { value: "dark", label: t.settings.themeDark },
            ]}
            value={colorScheme}
            onChange={(v) => v && setColorScheme(v as MantineColorScheme)}
            allowDeselect={false}
          />
          <Switch
            label={t.settings.autoAdvance}
            checked={settings.autoAdvance}
            onChange={(e) => update({ autoAdvance: e.currentTarget.checked })}
          />
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600}>{t.settings.sync}</Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconRefresh size={16} />}
              loading={sync.state === "syncing"}
              onClick={() => void syncNow(db)}
            >
              {t.settings.syncNow}
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            {t.settings.pending(pendingCount)}
            {sync.state === "error" ? t.settings.lastFailed(sync.error ?? "") : null}
            {sync.lastOkAt
              ? t.settings.lastSynced(new Date(sync.lastOkAt).toLocaleTimeString())
              : null}
          </Text>
          <Text size="xs" c="dimmed">
            {t.settings.device(deviceId || t.settings.deviceUnused)}
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="xs">
          <Text fw={600}>{t.settings.diagnostics}</Text>
          <Text size="sm" c="dimmed">
            {t.settings.diagnosticsHint(entries)}
          </Text>
          <Group>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconCopy size={16} />}
              onClick={() => void copyLog()}
            >
              {copied ? t.settings.copied : t.settings.copyLog}
            </Button>
            <Button size="xs" variant="subtle" color="gray" onClick={wipeLog}>
              {t.settings.clearLog}
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="xs">
          <Text fw={600}>{t.settings.dangerZone}</Text>
          <Text size="sm" c="dimmed">
            {t.settings.removeHint}
          </Text>
          <Group>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => void removeFromDevice()}
            >
              {t.settings.removeFromDevice}
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
