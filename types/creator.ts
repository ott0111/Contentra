export const niches = ["Gaming", "Esports", "Technology", "Business", "Education", "Entertainment", "Lifestyle", "Fashion", "Fitness", "Music", "Comedy", "Finance", "Other"] as const;
export const platforms = ["X", "TikTok", "YouTube", "Instagram", "Twitch", "Other"] as const;
export const goals = ["Grow my audience", "Get more engagement", "Build a personal brand", "Make money", "Get clients", "Build a community", "Become a full-time creator"] as const;
export const contentStyles = ["Educational", "Funny", "Casual", "Storytelling", "Opinion", "Entertainment", "Motivational", "Professional", "News", "Commentary"] as const;
export const experienceLevels = ["Just getting started", "Growing", "Experienced", "Full-time creator"] as const;

export type CreatorGoal = typeof goals[number];
export type CreatorPlatform = typeof platforms[number];
export type ContentStyle = typeof contentStyles[number];
export type ExperienceLevel = typeof experienceLevels[number];

export type CreatorProfile = {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  avatar: string;
  niches: string[];
  targetAudience: string;
  experienceLevel: ExperienceLevel | "";
  platforms: CreatorPlatform[];
  primaryGoal: CreatorGoal | "";
  contentStyles: ContentStyle[];
  notificationPreferences?: Record<string, boolean>;
};

export type OnboardingData = Omit<CreatorProfile, "id" | "bio" | "avatar" | "notificationPreferences" | "experienceLevel"> & { experienceLevel: ExperienceLevel | ""; otherNiche: string; otherPlatform: string };