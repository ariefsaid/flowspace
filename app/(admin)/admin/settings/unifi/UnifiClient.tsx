"use client";
/**
 * UniFi settings editor (I-042, spec 0009 fan-out). CONFIG page only — the
 * real UniFi controller integration ships in I-045 (owner-gated). "Uji
 * Koneksi" is a SIMULATED result via `testUnifiConnectionAction`, never a
 * live call. Secrets (Site Manager API Key / password) are never rendered
 * back verbatim: a previously-stored secret shows a masked "•••• tersimpan"
 * placeholder behind an "Ubah" affordance, and only an explicitly-edited
 * secret is forwarded on save.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Wifi,
  Save,
  Check,
  ArrowLeft,
  Cloud,
  Server,
  Eye,
  EyeOff,
  TestTube,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
} from "lucide-react";
import { Card, Input, Button } from "@/components/ui";
import { saveUnifiSettingsAction, testUnifiConnectionAction } from "./actions";
import type { UnifiConnectionMode, UnifiSettingsInitial, UnifiTestResult } from "./actions";

const MASKED_PLACEHOLDER = "•••• tersimpan";

/** Extracts the UniFi console ID from a pasted cloud console URL, e.g. .../consoles/ABC123/network/... */
function extractConsoleId(url: string): string {
  const match = url.match(/\/consoles\/([^/]+)/);
  return match ? match[1] : "";
}

type FormValues = {
  connectionMode: UnifiConnectionMode;
  cloudConsoleUrl: string;
  consoleId: string;
  controllerHost: string;
  controllerPort: string;
  username: string;
  siteName: string;
  siteManagerApiKey: string;
  password: string;
};

function toFormValues(initial: UnifiSettingsInitial): FormValues {
  return {
    connectionMode: initial.connectionMode,
    cloudConsoleUrl: initial.cloudConsoleUrl,
    consoleId: initial.consoleId,
    controllerHost: initial.controllerHost,
    controllerPort: initial.controllerPort,
    username: initial.username,
    siteName: initial.siteName,
    siteManagerApiKey: "",
    password: "",
  };
}

type SecretMode = "masked" | "editing";

const RESULT_STYLES: Record<UnifiTestResult["outcome"], { wrap: string; icon: typeof CheckCircle; label: string }> = {
  success: { wrap: "border-green-200 bg-green-50 text-green-700", icon: CheckCircle, label: "Terhubung (simulasi)" },
  partial: { wrap: "border-amber-200 bg-amber-50 text-amber-700", icon: AlertTriangle, label: "Sebagian (simulasi)" },
  failed: { wrap: "border-red-200 bg-red-50 text-red-700", icon: XCircle, label: "Gagal (simulasi)" },
};

export function UnifiClient({ initial }: { initial: UnifiSettingsInitial }) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(() => toFormValues(initial));
  const [apiKeyMode, setApiKeyMode] = useState<SecretMode>(initial.hasApiKey ? "masked" : "editing");
  const [passwordMode, setPasswordMode] = useState<SecretMode>(initial.hasPassword ? "masked" : "editing");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [testStatus, setTestStatus] = useState<"idle" | "pending">("idle");
  const [testResult, setTestResult] = useState<UnifiTestResult | null>(null);

  function resetSaveFeedback() {
    setSaveStatus("idle");
    setSaveError(null);
  }

  function setMode(mode: UnifiConnectionMode) {
    resetSaveFeedback();
    setTestResult(null);
    setValues((v) => ({ ...v, connectionMode: mode }));
  }

  function onCloudUrlChange(url: string) {
    resetSaveFeedback();
    setValues((v) => ({ ...v, cloudConsoleUrl: url, consoleId: extractConsoleId(url) }));
  }

  function field<K extends keyof FormValues>(key: K) {
    return (value: FormValues[K]) => {
      resetSaveFeedback();
      setValues((v) => ({ ...v, [key]: value }));
    };
  }

  async function onSave() {
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await saveUnifiSettingsAction({
        connectionMode: values.connectionMode,
        cloudConsoleUrl: values.cloudConsoleUrl,
        consoleId: values.consoleId,
        controllerHost: values.controllerHost,
        controllerPort: values.controllerPort,
        username: values.username,
        siteName: values.siteName,
        ...(apiKeyMode === "editing" ? { siteManagerApiKey: values.siteManagerApiKey } : {}),
        ...(passwordMode === "editing" ? { password: values.password } : {}),
      });
      setSaveStatus("saved");
      if (apiKeyMode === "editing" && values.siteManagerApiKey) {
        setApiKeyMode("masked");
        setValues((v) => ({ ...v, siteManagerApiKey: "" }));
      }
      if (passwordMode === "editing" && values.password) {
        setPasswordMode("masked");
        setValues((v) => ({ ...v, password: "" }));
      }
      router.refresh();
    } catch (e) {
      setSaveStatus("error");
      setSaveError(saveErrorMessage(e));
    }
  }

  async function onTest() {
    setTestStatus("pending");
    setTestResult(null);
    try {
      const result = await testUnifiConnectionAction({
        connectionMode: values.connectionMode,
        cloudConsoleUrl: values.cloudConsoleUrl,
        consoleId: values.consoleId,
        apiKeyProvided: apiKeyMode === "editing" ? values.siteManagerApiKey.length > 0 : initial.hasApiKey,
        controllerHost: values.controllerHost,
        controllerPort: values.controllerPort,
        username: values.username,
        passwordProvided: passwordMode === "editing" ? values.password.length > 0 : initial.hasPassword,
      });
      setTestResult(result);
    } finally {
      setTestStatus("idle");
    }
  }

  const isCloud = values.connectionMode === "cloud";

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Wifi className="h-8 w-8 text-teal-600" aria-hidden="true" />
          UniFi Controller
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Konfigurasi koneksi ke UniFi Controller untuk generate voucher WiFi.
        </p>
      </div>

      <div
        role="note"
        className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Penerbitan voucher WiFi masih disimulasikan sampai UniFi Controller benar-benar tersambung.</span>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <span className="block text-sm font-medium text-gray-700">Mode Koneksi</span>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={isCloud}
              onClick={() => setMode("cloud")}
              className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 ${
                isCloud ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Cloud className={`h-5 w-5 ${isCloud ? "text-teal-600" : "text-gray-500"}`} aria-hidden="true" />
              <span>
                <span className={`block text-sm font-medium ${isCloud ? "text-teal-900" : "text-gray-700"}`}>
                  Cloud
                </span>
                <span className="block text-xs text-gray-500">Via unifi.ui.com</span>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={!isCloud}
              onClick={() => setMode("local")}
              className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 ${
                !isCloud ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Server className={`h-5 w-5 ${!isCloud ? "text-teal-600" : "text-gray-500"}`} aria-hidden="true" />
              <span>
                <span className={`block text-sm font-medium ${!isCloud ? "text-teal-900" : "text-gray-700"}`}>
                  Lokal
                </span>
                <span className="block text-xs text-gray-500">IP controller langsung</span>
              </span>
            </button>
          </div>
        </div>

        {testResult && <TestResultBanner result={testResult} />}

        {isCloud ? (
          <div className="space-y-4">
            <label className="block" htmlFor="unifi-cloud-console-url">
              <span className="text-sm font-medium text-gray-700">UniFi Cloud Console URL</span>
              <Input
                id="unifi-cloud-console-url"
                className="mt-1"
                placeholder="https://unifi.ui.com/consoles/XXXX/network/default/dashboard"
                value={values.cloudConsoleUrl}
                onChange={(e) => onCloudUrlChange(e.target.value)}
              />
            </label>

            {values.consoleId && (
              <div>
                <span className="block text-sm font-medium text-gray-500">Console ID (otomatis)</span>
                <code className="mt-1 block rounded-lg bg-slate-50 px-3 py-2 text-xs font-mono text-gray-700 truncate">
                  {values.consoleId}
                </code>
              </div>
            )}

            <SecretField
              id="unifi-site-manager-api-key"
              label="Site Manager API Key"
              value={values.siteManagerApiKey}
              mode={apiKeyMode}
              show={showApiKey}
              onToggleShow={() => setShowApiKey((s) => !s)}
              onChange={field("siteManagerApiKey")}
              onEdit={() => setApiKeyMode("editing")}
              placeholder="Paste API Key dari unifi.ui.com"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block" htmlFor="unifi-controller-host">
              <span className="text-sm font-medium text-gray-700">Controller Host</span>
              <Input
                id="unifi-controller-host"
                className="mt-1"
                placeholder="192.168.1.1 atau unifi.domain.com"
                value={values.controllerHost}
                onChange={(e) => field("controllerHost")(e.target.value)}
              />
            </label>

            <label className="block" htmlFor="unifi-controller-port">
              <span className="text-sm font-medium text-gray-700">Port</span>
              <Input
                id="unifi-controller-port"
                className="mt-1"
                inputMode="numeric"
                placeholder="8443"
                value={values.controllerPort}
                onChange={(e) => field("controllerPort")(e.target.value)}
              />
            </label>

            <label className="block" htmlFor="unifi-username">
              <span className="text-sm font-medium text-gray-700">Username</span>
              <Input
                id="unifi-username"
                className="mt-1"
                placeholder="admin"
                value={values.username}
                onChange={(e) => field("username")(e.target.value)}
              />
            </label>

            <SecretField
              id="unifi-password"
              label="Password"
              value={values.password}
              mode={passwordMode}
              show={showPassword}
              onToggleShow={() => setShowPassword((s) => !s)}
              onChange={field("password")}
              onEdit={() => setPasswordMode("editing")}
              placeholder="••••••••"
            />
          </div>
        )}

        <label className="block" htmlFor="unifi-site-name">
          <span className="text-sm font-medium text-gray-700">Site Name</span>
          <Input
            id="unifi-site-name"
            className="mt-1"
            placeholder="default"
            value={values.siteName}
            onChange={(e) => field("siteName")(e.target.value)}
          />
          <span className="mt-1 block text-xs text-gray-500">
            Nama site di UniFi Controller. Biarkan &quot;default&quot; jika hanya ada satu site.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button variant="outline" onClick={onTest} disabled={testStatus === "pending" || saveStatus === "saving"}>
            <TestTube className="h-4 w-4" aria-hidden="true" />
            {testStatus === "pending" ? "Menguji…" : "Uji Koneksi"}
          </Button>
          <Button onClick={onSave} disabled={saveStatus === "saving" || testStatus === "pending"}>
            {saveStatus === "saved" ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {saveStatus === "saving" ? "Menyimpan…" : saveStatus === "saved" ? "Tersimpan" : "Simpan"}
          </Button>
          {saveStatus === "error" && saveError && (
            <p role="alert" className="text-sm text-red-600">
              {saveError}
            </p>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Simulasi — integrasi UniFi menyusul (I-045). "Uji Koneksi" tidak menghubungi controller sungguhan.
        </p>
      </Card>
    </div>
  );
}

function TestResultBanner({ result }: { result: UnifiTestResult }) {
  const style = RESULT_STYLES[result.outcome];
  const Icon = style.icon;
  return (
    <div role="status" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${style.wrap}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="block font-medium">{style.label}</span>
        <span className="block">{result.message}</span>
      </span>
    </div>
  );
}

function SecretField({
  id,
  label,
  value,
  mode,
  show,
  onToggleShow,
  onChange,
  onEdit,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  mode: SecretMode;
  show: boolean;
  onToggleShow: () => void;
  onChange: (value: string) => void;
  onEdit: () => void;
  placeholder: string;
}) {
  if (mode === "masked") {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor={id}>
          {label}
        </label>
        <div className="mt-1 flex items-center gap-2">
          <Input id={id} value={MASKED_PLACEHOLDER} disabled readOnly className="flex-1" />
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Ubah
          </Button>
        </div>
      </div>
    );
  }

  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="relative mt-1">
        <Input
          id={id}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          aria-label={show ? "Sembunyikan nilai" : "Tampilkan nilai"}
          onClick={onToggleShow}
          className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </label>
  );
}

function saveErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (msg.startsWith("INVALID_URL")) return "Format Console URL harus diawali https://.";
  if (msg.startsWith("REQUIRED:consoleId")) return "Console ID tidak terdeteksi dari URL. Periksa format URL.";
  if (msg.startsWith("INVALID_HOST")) return "Format Controller Host tidak valid.";
  if (msg.startsWith("INVALID_PORT")) return "Port harus berupa angka 1-65535.";
  if (msg.startsWith("INVALID_LENGTH")) return "Salah satu field terlalu panjang — maksimal 500 karakter.";
  return "Gagal menyimpan. Coba lagi.";
}
