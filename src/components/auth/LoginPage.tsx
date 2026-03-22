"use client";

import { useState } from "react";
import {
  Loader2,
  Lock,
  Mail,
  MessageSquareText,
  Phone,
  Scale,
  ShieldCheck,
  User,
} from "lucide-react";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { LocaleMenu } from "@/components/branding/LocaleMenu";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";
import { useTranslation } from "@/hooks/useTranslation";
import type { SupportedLocale, UserRole } from "@/types";
import { useAuthContext } from "./AuthProvider";

type AuthMode = "login" | "register";

interface LoginPageProps {
  locale: SupportedLocale;
  onLocaleChange: (locale: SupportedLocale) => void;
}

export function LoginPage({ locale, onLocaleChange }: LoginPageProps) {
  const {
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    requestPhoneOtp,
    verifyPhoneOtp,
    resetPhoneOtp,
  } = useAuthContext();
  const t = useTranslation(locale);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("worker");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSentTo, setOtpSentTo] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);

  const otpReady = Boolean(otpSentTo);

  const clearFeedback = () => {
    setError("");
    setNotice("");
  };

  const resetPhoneFlow = () => {
    resetPhoneOtp();
    setOtpCode("");
    setOtpSentTo("");
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    clearFeedback();
    resetPhoneFlow();
  };

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    clearFeedback();
    setFormLoading(true);

    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.login.loginFailed);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEmailRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    clearFeedback();

    if (password.length < 6) {
      setError(t.login.passwordShort);
      return;
    }

    setFormLoading(true);
    try {
      await signUpWithEmail(email, password, role, locale, displayName);
      switchMode("login");
      setPassword("");
      setNotice(t.login.emailVerificationSent);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.login.registerFailed);
    } finally {
      setFormLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    clearFeedback();
    setFormLoading(true);
    try {
      await signInWithGoogle(role, locale);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.login.googleFailed);
    } finally {
      setFormLoading(false);
    }
  };

  const handleSendPhoneOtp = async () => {
    clearFeedback();
    setPhoneLoading(true);

    try {
      const normalizedPhone = await requestPhoneOtp(phoneNumber, locale);
      setOtpSentTo(normalizedPhone);
      setNotice(t.login.phoneOtpSent.replace("{phone}", normalizedPhone));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.login.phoneSendFailed);
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    clearFeedback();

    if (!otpCode.trim()) {
      setError(t.login.phoneCodeRequired);
      return;
    }

    if (mode === "register" && !displayName.trim()) {
      setError(t.login.phoneNameRequired);
      return;
    }

    setPhoneLoading(true);
    try {
      await verifyPhoneOtp(otpCode, mode, role, locale, displayName);
      setNotice(
        mode === "login"
          ? t.login.phoneLoginSuccess
          : t.login.phoneRegisterSuccess
      );
      resetPhoneFlow();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.login.phoneVerifyFailed);
    } finally {
      setPhoneLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-white/40 bg-white/30 shadow-[0_40px_120px_rgba(16,33,58,0.18)] backdrop-blur-sm lg:grid-cols-[1fr_0.95fr]">
        <section className="brand-hero hidden p-8 text-white lg:flex lg:flex-col lg:justify-between">
          <BrandLogo
            labelClassName="text-3xl text-white"
            subtitleClassName="text-xs uppercase tracking-[0.32em] text-white/70"
          />
          <div className="max-w-xl">
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.32em] text-white/80">
              {t.login.eyebrow}
            </span>
            <h1 className="brand-title mt-4 text-4xl leading-tight">
              {t.login.panelTitle}
            </h1>
            <div className="mt-6 grid gap-3">
              {t.login.panelItems.map((item) => (
                <div
                  key={item}
                  className="rounded-[1.3rem] border border-white/16 bg-white/10 px-4 py-3 text-sm text-white/84"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col bg-white/78 px-5 py-6 backdrop-blur-xl sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <BrandLogo size={40} labelClassName="text-xl" className="lg:hidden" />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <PwaInstallButton locale={locale} />
              <LocaleMenu value={locale} onChange={onLocaleChange} />
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 items-center py-8">
            <div className="w-full rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-lg sm:p-7">
              <h2 className="brand-title text-3xl text-slate-900">
                {t.login.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                {t.login.description}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-2 rounded-[1.2rem] bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className={`rounded-[1rem] px-4 py-2.5 text-sm font-medium transition ${
                    mode === "login"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  {t.login.login}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className={`rounded-[1rem] px-4 py-2.5 text-sm font-medium transition ${
                    mode === "register"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  {t.login.register}
                </button>
              </div>

              {mode === "login" ? (
                <>
                  <h3 className="mt-6 text-lg font-semibold text-slate-900">
                    {t.login.loginTitle}
                  </h3>
                  <button
                    type="button"
                    onClick={handleGoogleAuth}
                    disabled={formLoading || phoneLoading}
                    className="mt-5 flex w-full items-center justify-center gap-3 rounded-[1.2rem] border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {formLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t.login.googleLogin}
                  </button>
                  <Divider label={t.login.or} />
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <InputField
                      icon={<Mail className="h-5 w-5" />}
                      type="email"
                      value={email}
                      placeholder={t.login.email}
                      onChange={setEmail}
                    />
                    <InputField
                      icon={<Lock className="h-5 w-5" />}
                      type="password"
                      value={password}
                      placeholder={t.login.password}
                      onChange={setPassword}
                    />
                    <button
                      type="submit"
                      disabled={formLoading || phoneLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-[var(--brand-ink)] px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {formLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {t.login.submitLogin}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <h3 className="mt-6 text-lg font-semibold text-slate-900">
                    {t.login.registerTitle}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">{t.login.roleNote}</p>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <RoleButton
                      active={role === "worker"}
                      icon={<User className="h-5 w-5" />}
                      label={t.login.worker}
                      onClick={() => setRole("worker")}
                    />
                    <RoleButton
                      active={role === "lawyer"}
                      icon={<Scale className="h-5 w-5" />}
                      label={t.login.lawyer}
                      onClick={() => setRole("lawyer")}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleAuth}
                    disabled={formLoading || phoneLoading}
                    className="mt-5 flex w-full items-center justify-center gap-3 rounded-[1.2rem] border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {formLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t.login.googleRegister}
                  </button>
                  <Divider label={t.login.or} />
                  <form onSubmit={handleEmailRegister} className="space-y-4">
                    <InputField
                      icon={<User className="h-5 w-5" />}
                      type="text"
                      value={displayName}
                      placeholder={t.login.fullName}
                      onChange={setDisplayName}
                    />
                    <InputField
                      icon={<Mail className="h-5 w-5" />}
                      type="email"
                      value={email}
                      placeholder={t.login.email}
                      onChange={setEmail}
                    />
                    <InputField
                      icon={<Lock className="h-5 w-5" />}
                      type="password"
                      value={password}
                      placeholder={t.login.passwordMin}
                      onChange={setPassword}
                    />
                    <button
                      type="submit"
                      disabled={formLoading || phoneLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-[var(--brand-ink)] px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {formLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {t.login.submitRegister}
                    </button>
                  </form>
                </>
              )}

              <Divider label={t.login.phoneOr} />
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm">
                    <Phone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-semibold text-slate-900">
                        {mode === "login"
                          ? t.login.phoneLoginTitle
                          : t.login.phoneRegisterTitle}
                      </h4>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                        OTP
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {mode === "login"
                        ? t.login.phoneLoginHint
                        : t.login.phoneRegisterHint}
                    </p>
                  </div>
                </div>

                {mode === "register" ? (
                  <div className="mt-4">
                    <InputField
                      icon={<User className="h-5 w-5" />}
                      type="text"
                      value={displayName}
                      placeholder={t.login.fullName}
                      onChange={setDisplayName}
                    />
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  <InputField
                    icon={<Phone className="h-5 w-5" />}
                    type="tel"
                    value={phoneNumber}
                    placeholder={t.login.phoneNumber}
                    onChange={setPhoneNumber}
                  />
                  <p className="text-xs leading-6 text-slate-500">
                    {t.login.phoneNumberHint}
                  </p>

                  {otpReady ? (
                    <>
                      <div className="rounded-[1.1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        <div className="flex items-start gap-2">
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>
                            {t.login.phoneOtpSent.replace("{phone}", otpSentTo)}
                          </span>
                        </div>
                      </div>
                      <InputField
                        icon={<MessageSquareText className="h-5 w-5" />}
                        type="text"
                        value={otpCode}
                        placeholder={t.login.phoneCode}
                        onChange={setOtpCode}
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={handleVerifyPhoneOtp}
                          disabled={phoneLoading || formLoading}
                          className="flex items-center justify-center gap-2 rounded-[1.2rem] bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {phoneLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          {mode === "login"
                            ? t.login.phoneSubmitLogin
                            : t.login.phoneSubmitRegister}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            resetPhoneFlow();
                            clearFeedback();
                          }}
                          disabled={phoneLoading || formLoading}
                          className="rounded-[1.2rem] border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {t.login.changePhone}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendPhoneOtp}
                      disabled={phoneLoading || formLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-[rgba(15,23,42,0.92)] px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {phoneLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {t.login.sendPhoneCode}
                    </button>
                  )}
                </div>

                <p className="mt-4 text-xs leading-6 text-slate-400">
                  {t.login.phoneSecurityNote}
                </p>
              </div>

              {notice ? (
                <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {notice}
                </p>
              ) : null}
              {error ? (
                <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
                  {error}
                </p>
              ) : null}

              <div id="phone-auth-recaptcha" className="mt-4 min-h-[1px]" />
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
      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function RoleButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[1.2rem] border px-4 py-4 text-left transition ${
        active
          ? "border-[rgba(184,100,67,0.44)] bg-[rgba(184,100,67,0.08)] text-slate-900"
          : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-3">{icon}</div>
      <p className="mt-3 text-sm font-medium">{label}</p>
    </button>
  );
}

function InputField({
  icon,
  type,
  value,
  placeholder,
  onChange,
}: {
  icon: React.ReactNode;
  type: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 transition focus-within:border-[rgba(184,100,67,0.44)] focus-within:ring-4 focus-within:ring-[rgba(184,100,67,0.08)]">
      <span className="text-slate-400">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
      />
    </label>
  );
}
