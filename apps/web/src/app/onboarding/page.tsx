"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import { api, ApiClientError } from "@/lib/api";

type WorkspaceType =
  | "CREATOR"
  | "PERSONAL_BRAND"
  | "BUSINESS"
  | "AGENCY";

type OnboardingState = {
  currentStep?: number;
  workspaceType?: WorkspaceType;
  website?: string;
  niche?: string;
  audience?: string;
  goals?: string[];
  platforms?: string[];
  tone?: string;
  completed?: boolean;
};

type OnboardingResponse = {
  state?: OnboardingState;
  completedAt?: string | null;
};

type WorkspaceMembership = {
  role: string;
  workspace: {
    id: string;
    name: string;
    type: WorkspaceType;
  };
};

const steps = [
  {
    title: "Welcome",
    description:
      "Set up the context that makes Contentra useful from day one.",
  },
  {
    title: "What are you building?",
    description:
      "Tell us what you're building so Contentra can tailor your workspace.",
  },
  {
    title: "Your website",
    description:
      "Give Contentra your website so it can understand your business.",
  },
  {
    title: "Your niche",
    description:
      "Tell Contentra what you create or what your business does.",
  },
  {
    title: "Your audience",
    description:
      "Describe the people you want to reach.",
  },
  {
    title: "Your goals",
    description:
      "Choose the outcomes you want Contentra to help you achieve.",
  },
  {
    title: "Your platforms",
    description:
      "Choose where you want to grow.",
  },
  {
    title: "Your brand",
    description:
      "Give Contentra a sense of how you want your content to feel.",
  },
  {
    title: "Connect your accounts",
    description:
      "Connect your social accounts or skip this step for now.",
  },
  {
    title: "You're ready",
    description:
      "Your Contentra workspace has the context it needs to get started.",
  },
] as const;

const workspaceOptions: Array<{
  label: string;
  value: WorkspaceType;
  description: string;
}> = [
  {
    label: "Creator",
    value: "CREATOR",
    description: "I create content around myself or my work.",
  },
  {
    label: "Personal Brand",
    value: "PERSONAL_BRAND",
    description: "I'm building an audience around my personal brand.",
  },
  {
    label: "Business",
    value: "BUSINESS",
    description: "I'm growing a company, product, or service.",
  },
  {
    label: "Agency",
    value: "AGENCY",
    description: "I manage growth and content for clients.",
  },
];

const goalOptions = [
  "Grow my audience",
  "Increase engagement",
  "Generate leads",
  "Drive sales",
  "Build authority",
  "Stay consistent",
  "Understand what content works",
];

const platformOptions = [
  "Instagram",
  "TikTok",
  "YouTube",
  "X",
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceType, setWorkspaceType] =
    useState<WorkspaceType>("CREATOR");
  const [website, setWebsite] = useState("");
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [tone, setTone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const current = steps[step];

  const progress = useMemo(
    () => ((step + 1) / steps.length) * 100,
    [step],
  );

  useEffect(() => {
    let cancelled = false;

    const restore = async (id: string) => {
      try {
        const response = await api<OnboardingResponse>(
          `/api/v1/workspaces/${id}/onboarding`,
          {},
          id,
        );

        if (cancelled) return;

        const state = response.state ?? {};

        setWorkspaceId(id);
        setStep(Math.min(state.currentStep ?? 0, steps.length - 1));
        setWorkspaceType(state.workspaceType ?? "CREATOR");
        setWebsite(state.website ?? "");
        setNiche(state.niche ?? "");
        setAudience(state.audience ?? "");
        setGoals(state.goals ?? []);
        setPlatforms(state.platforms ?? []);
        setTone(state.tone ?? "");
        setError("");
      } catch (requestError) {
        if (cancelled) return;

        localStorage.removeItem("contentra_workspace");

        if (requestError instanceof ApiClientError) {
          setError(requestError.message);
        } else {
          setError(
            "We could not load your onboarding. Please try again.",
          );
        }

        setWorkspaceId("");
      }
    };

    const prepare = async () => {
      try {
        const memberships = await api<WorkspaceMembership[]>(
          "/api/v1/workspaces",
        );

        if (cancelled) return;

        if (!memberships.length) {
          setError(
            "Your Contentra workspace could not be found. Please sign in again.",
          );
          setLoading(false);
          return;
        }

        const storedId =
          localStorage.getItem("contentra_workspace") ?? "";

        const storedMembership = memberships.find(
          (membership) => membership.workspace.id === storedId,
        );

        const membership =
          storedMembership ?? memberships[0];

        const id = membership.workspace.id;

        localStorage.setItem("contentra_workspace", id);

        await restore(id);
      } catch (requestError) {
        if (cancelled) return;

        if (requestError instanceof ApiClientError) {
          setError(requestError.message);
        } else {
          setError(
            "We could not prepare your workspace. Please sign in again.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void prepare();

    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (
    nextStep: number,
    completed = false,
  ) => {
    if (!workspaceId) {
      setError(
        "Your workspace is still loading. Please try again.",
      );
      return false;
    }

    setSaving(true);
    setError("");

    try {
      await api(
        `/api/v1/workspaces/${workspaceId}/onboarding`,
        {
          method: "PUT",
          body: JSON.stringify({
            currentStep: nextStep,
            workspaceType,
            website: website || undefined,
            niche: niche || undefined,
            audience: audience || undefined,
            goals,
            platforms,
            tone: tone || undefined,
            completed,
          }),
        },
        workspaceId,
      );

      return true;
    } catch (requestError) {
      if (requestError instanceof ApiClientError) {
        setError(requestError.message);
      } else {
        setError(
          "Your progress could not be saved. Please try again.",
        );
      }

      return false;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    const nextStep = Math.min(
      step + 1,
      steps.length - 1,
    );

    const saved = await save(nextStep, false);

    if (saved) {
      setStep(nextStep);
    }
  };

  const back = async () => {
    if (step === 0) return;

    const previousStep = step - 1;

    const saved = await save(previousStep);

    if (saved) {
      setStep(previousStep);
    }
  };

  const toggleGoal = (goal: string) => {
    setGoals((currentGoals) =>
      currentGoals.includes(goal)
        ? currentGoals.filter((item) => item !== goal)
        : [...currentGoals, goal],
    );
  };

  const togglePlatform = (platform: string) => {
    setPlatforms((currentPlatforms) =>
      currentPlatforms.includes(platform)
        ? currentPlatforms.filter(
            (item) => item !== platform,
          )
        : [...currentPlatforms, platform],
    );
  };

  if (loading) {
    return <div className="onboarding-v2"><div className="onboarding-loading"><span className="onboarding-orb" /><p>Preparing your workspace...</p></div></div>;
  }

  return (
    <div className="onboarding-v2">
      <header className="onboarding-top">
        <div className="onboarding-brand"><span className="brand-mark" aria-hidden="true" /> <strong>Contentra</strong></div>
        <div className="onboarding-progress-label"><span>{step + 1}</span> / {steps.length}</div>
      </header>
      <div className="onboarding-layout">
        <aside className="onboarding-sidebar">
          <div>
            <span className="section-label">Workspace setup</span>
            <h1>Build your<br /><span>Contentra brain.</span></h1>
            <p>Give Contentra the context it needs to make the product feel built around you.</p>
          </div>
          <div className="onboarding-step-list">
            {steps.map((item, index) => <div key={item.title} className={'onboarding-step-item ' + (index === step ? 'active ' : '') + (index < step ? 'done' : '')}><span>{index < step ? '✓' : String(index + 1).padStart(2, '0')}</span><div><b>{item.title}</b>{index === step && <small>{item.description}</small>}</div></div>)}
          </div>
          <div className="onboarding-sidebar-foot"><span className="onboarding-dot" /> Your progress saves automatically</div>
        </aside>
        <main className="onboarding-main">
          <div className="onboarding-main-inner">
            <div className="onboarding-main-head"><span className="section-label">Step {step + 1}</span><div className="onboarding-progress-track"><i style={{ width: `${progress}%` }} /></div></div>
            <div className="onboarding-content-card">
              <div className="onboarding-copy"><h2>{current.title}</h2><p>{current.description}</p></div>
              {error && <div className="onboarding-error" role="alert">{error}</div>}

              {step === 0 && <div className="onboarding-welcome-grid"><div className="welcome-panel"><span className="welcome-icon">✦</span><h3>Make Contentra yours.</h3><p>We will use your answers to personalize ideas, recommendations, creation, analytics, and your next best action.</p></div><div className="welcome-list"><div><b>01</b><span>Understand your business</span></div><div><b>02</b><span>Build your content context</span></div><div><b>03</b><span>Turn signals into action</span></div></div></div>}

              {step === 1 && <div className="onboarding-choice-grid">{workspaceOptions.map((option) => <button type="button" className={'onboarding-choice ' + (workspaceType === option.value ? 'selected' : '')} key={option.value} onClick={() => setWorkspaceType(option.value)}><span className="choice-number">{workspaceOptions.indexOf(option) + 1}</span><span><strong>{option.label}</strong><small>{option.description}</small></span><span className="choice-check">{workspaceType === option.value ? '✓' : ''}</span></button>)}</div>}

              {step === 2 && <div className="onboarding-field-wrap"><label className="field"><span>Website URL</span><input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://yourwebsite.com" type="url" /></label><div className="onboarding-hint"><span>⌁</span><div><strong>Why we ask</strong><p>Contentra can use your website to understand what you do, who you serve, and how your brand is positioned.</p></div></div></div>}

              {step === 3 && <label className="field onboarding-textarea"><span>What do you create or what does your business do?</span><textarea value={niche} onChange={(event) => setNiche(event.target.value)} rows={7} placeholder="Tell us about your niche, product, service, or content..." /><small>Be as specific as you want. A few useful sentences are enough.</small></label>}
              {step === 4 && <label className="field onboarding-textarea"><span>Who are you trying to reach?</span><textarea value={audience} onChange={(event) => setAudience(event.target.value)} rows={7} placeholder="Describe your ideal audience..." /><small>Think about who gets the most value from what you create.</small></label>}
              {step === 5 && <div className="onboarding-select-wrap"><p className="onboarding-select-label">Choose everything that matters to you</p><div className="onboarding-chip-grid">{goalOptions.map((goal) => <button type="button" className={'onboarding-chip ' + (goals.includes(goal) ? 'selected' : '')} key={goal} onClick={() => toggleGoal(goal)}><span>{goals.includes(goal) ? '✓' : '+'}</span>{goal}</button>)}</div></div>}
              {step === 6 && <div className="onboarding-select-wrap"><p className="onboarding-select-label">Where do you want to grow?</p><div className="onboarding-chip-grid platform-grid">{platformOptions.map((platform) => <button type="button" className={'onboarding-chip ' + (platforms.includes(platform) ? 'selected' : '')} key={platform} onClick={() => togglePlatform(platform)}><span>{platforms.includes(platform) ? '✓' : '+'}</span>{platform}</button>)}</div></div>}
              {step === 7 && <label className="field onboarding-textarea"><span>How should your content feel?</span><textarea value={tone} onChange={(event) => setTone(event.target.value)} rows={7} placeholder="For example: direct, educational, confident, funny, minimal..." /><small>This helps Contentra keep your voice consistent.</small></label>}
              {step === 8 && <div className="onboarding-connect"><div className="connect-visual"><span>◎</span><span>+</span><span>◉</span></div><h3>Connect when you're ready.</h3><p>Social connections bring real performance context into Contentra. You can skip this step and connect accounts later from your workspace.</p><button type="button" className="onboarding-skip" onClick={next}>Skip for now</button></div>}
              {step === 9 && <div className="onboarding-ready"><div className="ready-icon">✓</div><span className="section-label">Setup complete</span><h3>Your workspace is ready.</h3><p>Contentra now has the context it needs to make recommendations around your business, audience, goals, platforms, and brand direction.</p><div className="ready-summary"><span>{workspaceType.replace('_', ' ')}</span>{website && <span>Website added</span>}{goals.length > 0 && <span>{goals.length} goals</span>}{platforms.length > 0 && <span>{platforms.length} platforms</span>}</div></div>}

              <div className="onboarding-actions">
                {step > 0 ? <Button variant="secondary" onClick={back} disabled={saving}>Back</Button> : <span />}
                {step === 9 ? <Button onClick={async () => { const saved = await save(9, true); if (saved) window.location.assign('/home'); }} disabled={saving}>{saving ? 'Saving...' : 'Open Contentra'}</Button> : <Button onClick={next} disabled={saving || !workspaceId}>{saving ? 'Saving...' : step === 8 ? 'Continue' : 'Continue'}</Button>}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
