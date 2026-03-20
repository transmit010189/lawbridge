"use client";

import { useState } from "react";
import { Loader2, Lock, Mail, Scale, User } from "lucide-react";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { LocaleMenu } from "@/components/branding/LocaleMenu";
import { useAuthContext } from "./AuthProvider";
import type { SupportedLocale, UserRole } from "@/types";

type AuthMode = "login" | "register";

interface LoginPageProps {
  locale: SupportedLocale;
  onLocaleChange: (locale: SupportedLocale) => void;
}

const en = {
  eyebrow: "LawBridge",
  panelTitle: "Search regulations, review source notes, then decide the next legal step.",
  panelItems: ["RAG legal questions", "Lawyer directory", "Wallet and account access"],
  title: "Login / Register",
  description: "Sign in first. Language can be changed at any time from the menu.",
  login: "Login",
  register: "Register",
  loginTitle: "Login to your account",
  registerTitle: "Create your account",
  googleLogin: "Continue with Google",
  googleRegister: "Register with Google",
  email: "Email",
  password: "Password",
  passwordMin: "Password (min 6 characters)",
  fullName: "Full name",
  worker: "I need legal help",
  lawyer: "I am a lawyer",
  roleNote: "Choose your role before registering.",
  submitLogin: "Login",
  submitRegister: "Register",
  or: "or",
  passwordShort: "Password must be at least 6 characters.",
  loginFailed: "Login failed.",
  registerFailed: "Registration failed.",
  googleFailed: "Google login failed.",
};

const zh = {
  eyebrow: "LawBridge",
  panelTitle: "先查法規、看註腳，再決定下一步法律行動。",
  panelItems: ["RAG 法規問答", "律師資料瀏覽", "錢包與帳戶管理"],
  title: "登入 / 註冊",
  description: "先登入即可開始使用，語言可隨時從右上角切換。",
  login: "登入",
  register: "註冊",
  loginTitle: "登入帳戶",
  registerTitle: "建立帳戶",
  googleLogin: "使用 Google 登入",
  googleRegister: "使用 Google 註冊",
  email: "Email",
  password: "密碼",
  passwordMin: "密碼（至少 6 碼）",
  fullName: "姓名",
  worker: "需要法律協助",
  lawyer: "我是律師",
  roleNote: "註冊前請先選擇帳戶身分。",
  submitLogin: "登入",
  submitRegister: "註冊",
  or: "或",
  passwordShort: "密碼至少需要 6 碼。",
  loginFailed: "登入失敗。",
  registerFailed: "註冊失敗。",
  googleFailed: "Google 登入失敗。",
};

function getCopy(locale: SupportedLocale) {
  return locale === "zh-TW" ? zh : en;
}

export function LoginPage({ locale, onLocaleChange }: LoginPageProps) {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuthContext();
  const copy = getCopy(locale);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("worker");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (password.length < 6) {
      setError(copy.passwordShort);
      return;
    }

    setLoading(true);
    try {
      await signUpWithEmail(email, password, role, locale, displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.registerFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle(role, locale);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.googleFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-white/40 bg-white/30 shadow-[0_40px_120px_rgba(16,33,58,0.18)] backdrop-blur-sm lg:grid-cols-[1fr_0.95fr]">
        <section className="brand-hero hidden p-8 text-white lg:flex lg:flex-col lg:justify-between">
          <BrandLogo labelClassName="text-3xl text-white" subtitleClassName="text-xs uppercase tracking-[0.32em] text-white/70" />
          <div className="max-w-xl">
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.32em] text-white/80">
              {copy.eyebrow}
            </span>
            <h1 className="brand-title mt-4 text-4xl leading-tight">{copy.panelTitle}</h1>
            <div className="mt-6 grid gap-3">
              {copy.panelItems.map((item) => (
                <div key={item} className="rounded-[1.3rem] border border-white/16 bg-white/10 px-4 py-3 text-sm text-white/84">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col bg-white/78 px-5 py-6 backdrop-blur-xl sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <BrandLogo size={40} labelClassName="text-xl" className="lg:hidden" />
            <LocaleMenu value={locale} onChange={onLocaleChange} />
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 items-center py-8">
            <div className="w-full rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-lg sm:p-7">
              <h2 className="brand-title text-3xl text-slate-900">{copy.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-500">{copy.description}</p>

              <div className="mt-6 grid grid-cols-2 gap-2 rounded-[1.2rem] bg-slate-100 p-1">
                <button type="button" onClick={() => setMode("login")} className={`rounded-[1rem] px-4 py-2.5 text-sm font-medium transition ${mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                  {copy.login}
                </button>
                <button type="button" onClick={() => setMode("register")} className={`rounded-[1rem] px-4 py-2.5 text-sm font-medium transition ${mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                  {copy.register}
                </button>
              </div>

              {mode === "login" ? (
                <>
                  <h3 className="mt-6 text-lg font-semibold text-slate-900">{copy.loginTitle}</h3>
                  <button type="button" onClick={handleGoogleAuth} disabled={loading} className="mt-5 flex w-full items-center justify-center gap-3 rounded-[1.2rem] border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {copy.googleLogin}
                  </button>
                  <Divider label={copy.or} />
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <InputField icon={<Mail className="h-5 w-5" />} type="email" value={email} placeholder={copy.email} onChange={setEmail} />
                    <InputField icon={<Lock className="h-5 w-5" />} type="password" value={password} placeholder={copy.password} onChange={setPassword} />
                    <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-[var(--brand-ink)] px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {copy.submitLogin}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <h3 className="mt-6 text-lg font-semibold text-slate-900">{copy.registerTitle}</h3>
                  <p className="mt-2 text-sm text-slate-500">{copy.roleNote}</p>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <RoleButton active={role === "worker"} icon={<User className="h-5 w-5" />} label={copy.worker} onClick={() => setRole("worker")} />
                    <RoleButton active={role === "lawyer"} icon={<Scale className="h-5 w-5" />} label={copy.lawyer} onClick={() => setRole("lawyer")} />
                  </div>
                  <button type="button" onClick={handleGoogleAuth} disabled={loading} className="mt-5 flex w-full items-center justify-center gap-3 rounded-[1.2rem] border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {copy.googleRegister}
                  </button>
                  <Divider label={copy.or} />
                  <form onSubmit={handleEmailRegister} className="space-y-4">
                    <InputField icon={<User className="h-5 w-5" />} type="text" value={displayName} placeholder={copy.fullName} onChange={setDisplayName} />
                    <InputField icon={<Mail className="h-5 w-5" />} type="email" value={email} placeholder={copy.email} onChange={setEmail} />
                    <InputField icon={<Lock className="h-5 w-5" />} type="password" value={password} placeholder={copy.passwordMin} onChange={setPassword} />
                    <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-[var(--brand-ink)] px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {copy.submitRegister}
                    </button>
                  </form>
                </>
              )}

              {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p> : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function RoleButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void; }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-[1.2rem] border px-4 py-4 text-left transition ${active ? "border-[rgba(184,100,67,0.44)] bg-[rgba(184,100,67,0.08)] text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      <div className="flex items-center gap-3">{icon}</div>
      <p className="mt-3 text-sm font-medium">{label}</p>
    </button>
  );
}

function InputField({ icon, type, value, placeholder, onChange }: { icon: React.ReactNode; type: string; value: string; placeholder: string; onChange: (value: string) => void; }) {
  return (
    <label className="flex items-center gap-3 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 transition focus-within:border-[rgba(184,100,67,0.44)] focus-within:ring-4 focus-within:ring-[rgba(184,100,67,0.08)]">
      <span className="text-slate-400">{icon}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
    </label>
  );
}
