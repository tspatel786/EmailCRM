import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  INQUIRY_CONSENT_TEXT,
  INQUIRY_SERVICES,
  publicInquirySchema,
  type InquiryService,
  type PublicInquiryInput,
} from "@crm/shared";
import { Button, Card, ErrorBox, Field, Input, Select, Textarea } from "../components/ui";

type Lang = "mr" | "en";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const COPY: Record<
  Lang,
  {
    title: string;
    subtitle: string;
    toggleLabel: string;
    nameLabel: string;
    namePlaceholder: string;
    mobileLabel: string;
    mobilePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    companyLabel: string;
    companyPlaceholder: string;
    serviceLabel: string;
    servicePlaceholder: string;
    messageLabel: string;
    messagePlaceholder: string;
    consentLabel: string;
    submit: string;
    submitting: string;
    thankYouTitle: string;
    thankYouBody: string;
    submitAnother: string;
    services: Record<InquiryService, string>;
    errors: Record<string, string>;
    apiErrors: {
      rate_limited: string;
      verification_required: string;
      verification_failed: string;
      generic: string;
    };
  }
> = {
  mr: {
    title: "चौकशी फॉर्म",
    subtitle: "तुमची माहिती भरा. आमची टीम तुमच्याशी संपर्क साधेल.",
    toggleLabel: "English",
    nameLabel: "पूर्ण नाव *",
    namePlaceholder: "उदा. राहुल पाटील",
    mobileLabel: "मोबाईल नंबर (१० अंकी) *",
    mobilePlaceholder: "उदा. 9876543210",
    emailLabel: "ईमेल (ऐच्छिक)",
    emailPlaceholder: "name@company.com",
    companyLabel: "कंपनी / व्यवसायाचे नाव (ऐच्छिक)",
    companyPlaceholder: "उदा. पाटील एंटरप्रायझेस",
    serviceLabel: "आवश्यक सेवा *",
    servicePlaceholder: "सेवा निवडा",
    messageLabel: "संदेश / गरज (ऐच्छिक)",
    messagePlaceholder: "तुमच्या प्रकल्पाबद्दल थोडक्यात माहिती लिहा...",
    consentLabel: "मी S.M.Patel IT Hub कडून संपर्क साधण्यास सहमती देतो/देते.",
    submit: "चौकशी पाठवा",
    submitting: "पाठवत आहे...",
    thankYouTitle: "नोंदणी पूर्ण झाली",
    thankYouBody: "धन्यवाद! आम्ही लवकरच तुमच्याशी संपर्क करू.",
    submitAnother: "नवीन चौकशी भरा",
    services: {
      Website: "वेबसाइट (Website)",
      "Mobile App": "मोबाईल अ‍ॅप (Mobile App)",
      "Software/CRM": "सॉफ्टवेअर / CRM (Software/CRM)",
      "WhatsApp Bot": "व्हॉट्सअ‍ॅप बॉट (WhatsApp Bot)",
      "Hosting/Domain": "होस्टिंग / डोमेन (Hosting/Domain)",
      Other: "इतर (Other)",
    },
    errors: {
      name_required: "कृपया तुमचे नाव लिहा.",
      name_too_long: "नाव १२० अक्षरांपेक्षा कमी असावे.",
      mobile_required: "कृपया १० अंकी मोबाईल नंबर लिहा.",
      mobile_invalid: "कृपया वैध १० अंकी भारतीय मोबाईल नंबर लिहा (६ ते ९ ने सुरू होणारा).",
      email_invalid: "कृपया वैध ईमेल पत्ता लिहा.",
      email_too_long: "ईमेल खूप मोठा आहे.",
      company_too_long: "कंपनीचे नाव खूप मोठे आहे.",
      service_required: "कृपया आवश्यक सेवा निवडा.",
      message_too_long: "संदेश २००० अक्षरांपेक्षा कमी असावा.",
      consent_required: "पुढे जाण्यासाठी कृपया संमती द्या.",
    },
    apiErrors: {
      rate_limited: "खूप जास्त विनंत्या आल्या आहेत. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.",
      verification_required: "कृपया सुरक्षा पडताळणी पूर्ण करा.",
      verification_failed: "सुरक्षा पडताळणी अयशस्वी झाली. कृपया पुन्हा प्रयत्न करा.",
      generic: "चौकशी पाठवता आली नाही. कृपया नंतर पुन्हा प्रयत्न करा.",
    },
  },
  en: {
    title: "Inquiry Form",
    subtitle: "Share your requirement and our team will get back to you.",
    toggleLabel: "मराठी",
    nameLabel: "Full Name *",
    namePlaceholder: "e.g. Rahul Patil",
    mobileLabel: "Mobile Number (10 digits) *",
    mobilePlaceholder: "e.g. 9876543210",
    emailLabel: "Email (Optional)",
    emailPlaceholder: "name@company.com",
    companyLabel: "Company Name (Optional)",
    companyPlaceholder: "e.g. Patil Enterprises",
    serviceLabel: "Service Needed *",
    servicePlaceholder: "Select a service",
    messageLabel: "Message (Optional)",
    messagePlaceholder: "Tell us briefly about what you need...",
    consentLabel: INQUIRY_CONSENT_TEXT,
    submit: "Submit Inquiry",
    submitting: "Submitting...",
    thankYouTitle: "Thank You",
    thankYouBody: "धन्यवाद! आम्ही लवकरच तुमच्याशी संपर्क करू. (Thank you! We will contact you shortly.)",
    submitAnother: "Submit another inquiry",
    services: {
      Website: "Website",
      "Mobile App": "Mobile App",
      "Software/CRM": "Software/CRM",
      "WhatsApp Bot": "WhatsApp Bot",
      "Hosting/Domain": "Hosting/Domain",
      Other: "Other",
    },
    errors: {
      name_required: "Please enter your name.",
      name_too_long: "Name must be 120 characters or less.",
      mobile_required: "Please enter your 10-digit mobile number.",
      mobile_invalid: "Please enter a valid 10-digit Indian mobile number.",
      email_invalid: "Please enter a valid email address.",
      email_too_long: "Email is too long.",
      company_too_long: "Company name is too long.",
      service_required: "Please select a service.",
      message_too_long: "Message must be 2000 characters or less.",
      consent_required: "Please accept the contact consent checkbox.",
    },
    apiErrors: {
      rate_limited: "Too many submissions from your connection. Please try again later.",
      verification_required: "Please complete the verification check.",
      verification_failed: "Verification failed. Please try again.",
      generic: "Could not submit your inquiry right now. Please try again.",
    },
  },
};

export function PublicInquiryPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [lang, setLang] = useState<Lang>("mr");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || "";
  const t = COPY[lang];

  const form = useForm<PublicInquiryInput>({
    resolver: zodResolver(publicInquirySchema),
    defaultValues: {
      name: "",
      mobile: "",
      email: "",
      company: "",
      service: "Website",
      message: "",
      consent: false,
      website_url: "",
      turnstile_token: "",
    },
  });

  useEffect(() => {
    if (!turnstileSiteKey || submitted || !turnstileRef.current) return;

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !turnstileRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-turnstile="true"]');
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.turnstile = "true";
        script.onload = renderWidget;
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener("load", renderWidget);
      }
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [turnstileSiteKey, submitted]);

  function translateFieldError(code?: string): string | undefined {
    if (!code) return undefined;
    return t.errors[code] ?? t.errors.service_required;
  }

  function translateApiError(code?: string): string {
    if (code === "rate_limited") return t.apiErrors.rate_limited;
    if (code === "verification_required") return t.apiErrors.verification_required;
    if (code === "verification_failed") return t.apiErrors.verification_failed;
    return t.apiErrors.generic;
  }

  async function onSubmit(values: PublicInquiryInput) {
    setServerError(null);
    if (!orgSlug) {
      setServerError(t.apiErrors.generic);
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      setServerError(t.apiErrors.verification_required);
      return;
    }

    setSubmitting(true);
    try {
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "http://127.0.0.1:54321";
      const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "public-anon-key";

      const res = await fetch(`${supabaseUrl}/functions/v1/submit-inquiry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          ...values,
          orgSlug,
          turnstile_token: turnstileToken || undefined,
        }),
      });

      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setServerError(translateApiError(data?.error));
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          setTurnstileToken("");
        }
        return;
      }

      setSubmitted(true);
      form.reset();
      setTurnstileToken("");
    } catch {
      setServerError(t.apiErrors.generic);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="S.M.Patel IT Hub"
              className="h-9 w-9 rounded-xl bg-white p-1 shadow-sm object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/favicon.png";
              }}
            />
            <div>
              <h1 className="text-lg font-bold text-slate-900 font-['Space_Grotesk'] leading-tight">
                {t.title}
              </h1>
              <p className="text-xs text-slate-500">S.M.Patel IT Hub</p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => setLang((prev) => (prev === "mr" ? "en" : "mr"))}
          >
            {t.toggleLabel}
          </Button>
        </div>

        {submitted ? (
          <Card className="text-center space-y-4 py-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xl font-bold">
              ✓
            </div>
            <h2 className="text-lg font-bold text-slate-900 font-['Space_Grotesk']">{t.thankYouTitle}</h2>
            <p className="text-sm sm:text-base font-medium text-emerald-800">{t.thankYouBody}</p>
            <div className="pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSubmitted(false);
                  setServerError(null);
                }}
              >
                {t.submitAnother}
              </Button>
            </div>
          </Card>
        ) : (
          <Card>
            <p className="mb-4 text-xs sm:text-sm text-slate-600">{t.subtitle}</p>
            <form
              className="space-y-3.5"
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
            >
              {serverError ? <ErrorBox message={serverError} /> : null}

              {/* Honeypot field: hidden from real users */}
              <div className="hidden" aria-hidden="true">
                <label>
                  Website
                  <input type="text" tabIndex={-1} autoComplete="off" {...form.register("website_url")} />
                </label>
              </div>

              <Field label={t.nameLabel} error={translateFieldError(form.formState.errors.name?.message)}>
                <Input
                  placeholder={t.namePlaceholder}
                  maxLength={120}
                  {...form.register("name")}
                />
              </Field>

              <Field label={t.mobileLabel} error={translateFieldError(form.formState.errors.mobile?.message)}>
                <Input
                  type="tel"
                  inputMode="numeric"
                  placeholder={t.mobilePlaceholder}
                  maxLength={20}
                  {...form.register("mobile")}
                />
              </Field>

              <Field label={t.emailLabel} error={translateFieldError(form.formState.errors.email?.message)}>
                <Input
                  type="email"
                  placeholder={t.emailPlaceholder}
                  maxLength={200}
                  {...form.register("email")}
                />
              </Field>

              <Field label={t.companyLabel} error={translateFieldError(form.formState.errors.company?.message)}>
                <Input
                  placeholder={t.companyPlaceholder}
                  maxLength={200}
                  {...form.register("company")}
                />
              </Field>

              <Field label={t.serviceLabel} error={translateFieldError(form.formState.errors.service?.message)}>
                <Select {...form.register("service")}>
                  {INQUIRY_SERVICES.map((svc) => (
                    <option key={svc} value={svc}>
                      {t.services[svc]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={t.messageLabel} error={translateFieldError(form.formState.errors.message?.message)}>
                <Textarea
                  rows={3}
                  placeholder={t.messagePlaceholder}
                  maxLength={2000}
                  {...form.register("message")}
                />
              </Field>

              <div className="space-y-1 pt-1">
                <label className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                    {...form.register("consent")}
                  />
                  <span>{t.consentLabel}</span>
                </label>
                {form.formState.errors.consent?.message ? (
                  <span className="text-xs font-medium text-rose-600 block">
                    {translateFieldError(form.formState.errors.consent.message)}
                  </span>
                ) : null}
              </div>

              {turnstileSiteKey ? <div ref={turnstileRef} className="pt-1" /> : null}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? t.submitting : t.submit}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
