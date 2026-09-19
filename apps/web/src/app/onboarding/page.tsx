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
    return (
      <div className="auth">
        <div className="onboard">
          <Card>
            <p className="muted">
              Preparing your Contentra workspace...
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="onboard">
        <div className="progress">
          <i style={{ width: `${progress}%` }} />
        </div>

        <Card>
          <span className="eyebrow">
            Step {step + 1} of {steps.length}
          </span>

          <h1
            style={{
              fontSize: 30,
              letterSpacing: "-.04em",
            }}
          >
            {current.title}
          </h1>

          <p>{current.description}</p>

          {error && (
            <p
              role="alert"
              style={{
                marginTop: 12,
              }}
            >
              {error}
            </p>
          )}

          {step === 0 && (
            <div className="form">
              <p className="muted">
                Contentra uses your business context, audience,
                goals, platforms, and brand direction to
                personalize your workspace.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="choice-grid">
              {workspaceOptions.map((option) => (
                <button
                  type="button"
                  className={`choice ${
                    workspaceType === option.value
                      ? "selected"
                      : ""
                  }`}
                  key={option.value}
                  onClick={() =>
                    setWorkspaceType(option.value)
                  }
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <label className="field">
              <span>Website</span>

              <input
                value={website}
                onChange={(event) =>
                  setWebsite(event.target.value)
                }
                placeholder="https://yourwebsite.com"
                type="url"
              />

              <small>
                Contentra can use your website to understand
                what you do, who you serve, and how your brand
                is positioned.
              </small>
            </label>
          )}

          {step === 3 && (
            <label className="field">
              <span>
                What do you create or what does your business
                do?
              </span>

              <textarea
                value={niche}
                onChange={(event) =>
                  setNiche(event.target.value)
                }
                rows={5}
                placeholder="Tell us about your niche, product, service, or content..."
              />
            </label>
          )}

          {step === 4 && (
            <label className="field">
              <span>
                Who are you trying to reach?
              </span>

              <textarea
                value={audience}
                onChange={(event) =>
                  setAudience(event.target.value)
                }
                rows={5}
                placeholder="Describe your ideal audience..."
              />
            </label>
          )}

          {step === 5 && (
            <div className="choice-grid">
              {goalOptions.map((goal) => (
                <button
                  type="button"
                  className={`choice ${
                    goals.includes(goal)
                      ? "selected"
                      : ""
                  }`}
                  key={goal}
                  onClick={() => toggleGoal(goal)}
                >
                  <strong>{goal}</strong>
                </button>
              ))}
            </div>
          )}

          {step === 6 && (
            <div className="choice-grid">
              {platformOptions.map((platform) => (
                <button
                  type="button"
                  className={`choice ${
                    platforms.includes(platform)
                      ? "selected"
                      : ""
                  }`}
                  key={platform}
                  onClick={() =>
                    togglePlatform(platform)
                  }
                >
                  <strong>{platform}</strong>
                </button>
              ))}
            </div>
          )}

          {step === 7 && (
            <label className="field">
              <span>
                How should your content feel?
              </span>

              <textarea
                value={tone}
                onChange={(event) =>
                  setTone(event.target.value)
                }
                rows={5}
                placeholder="For example: direct, educational, confident, funny, minimal..."
              />

              <small>
                Describe the voice or style you want
                Contentra to keep in mind.
              </small>
            </label>
          )}

          {step === 8 && (
            <div className="form">
              <div className="empty">
                <h3>
                  Connect your social accounts
                </h3>

                <p>
                  Connect your accounts to give Contentra
                  real performance context. You can also
                  skip this and connect them later.
                </p>
              </div>
            </div>
          )}

          {step === 9 && (
            <div className="form">
              <div className="empty">
                <h3>
                  Your Contentra workspace is ready.
                </h3>

                <p>
                  Contentra now has your business type,
                  website, niche, audience, goals,
                  platforms, and brand direction.
                </p>

                <p className="muted">
                  You can connect more accounts and add more
                  context from your workspace later.
                </p>
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 28,
            }}
          >
            {step > 0 ? (
              <Button
                variant="secondary"
                onClick={back}
                disabled={saving}
              >
                Back
              </Button>
            ) : (
              <span />
            )}

            {step === 9 ? (
              <Button
                onClick={async () => {
                  const saved = await save(9, true);

                  if (saved) {
                    window.location.assign("/home");
                  }
                }}
                disabled={saving}
              >
                {saving ? "Saving..." : "Open Contentra"}
              </Button>
            ) : (
              <Button
                onClick={next}
                disabled={saving || !workspaceId}
              >
                {saving ? "Saving..." : "Continue"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
