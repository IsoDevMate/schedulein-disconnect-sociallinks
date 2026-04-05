export enum V2SubscriptionPlan {
  FREE = "free",
  CREATOR = "creator",    // $29/mo, $290/yr
  PRO = "pro"            // $59/mo, $590/yr
}

export enum V2SubscriptionInterval {
  MONTHLY = "monthly",
  YEARLY = "yearly"
}

// Credit allocation per plan
export const V2_PLAN_CREDITS = {
  [V2SubscriptionPlan.FREE]: {
    profileScout: 10,
    ideaSpark: 10,
    postCredits: 15,
    platformLimits: {
      tiktok: 1,
      youtube: 1,
      instagram: 0,
      linkedin: 0
    },
    userLimit: 1,
    features: {
      viralRadarFeed: true,
      ideaVault: true,
      communityDiscord: true,
      standardSupport: true
    }
  },
  [V2SubscriptionPlan.CREATOR]: {
    profileScout: 100,
    ideaSpark: 50,
    postCredits: -1, // unlimited
    platformLimits: {
      tiktok: 2,
      youtube: 2,
      instagram: 0,
      linkedin: 0
    },
    userLimit: 1,
    features: {
      viralRadarFeed: true,
      ideaVault: true,
      communityDiscord: true,
      priorityEmailSupport: true,
      nicheAnalyzerFullAccess: true
    }
  },
  [V2SubscriptionPlan.PRO]: {
    profileScout: 300,
    ideaSpark: 150,
    postCredits: -1, // unlimited
    platformLimits: {
      tiktok: 5,
      youtube: 5,
      instagram: 0,
      linkedin: 0
    },
    userLimit: 3,
    features: {
      viralRadarFeed: true,
      ideaVault: true,
      communityDiscord: true,
      priorityDiscordSupport: true,
      nicheAnalyzerFullAccess: true,
      teamCollaboration: true
    }
  }
};

// Pricing configuration
export const V2_PLAN_PRICING = {
  [V2SubscriptionPlan.CREATOR]: {
    [V2SubscriptionInterval.MONTHLY]: 29,
    [V2SubscriptionInterval.YEARLY]: 290
  },
  [V2SubscriptionPlan.PRO]: {
    [V2SubscriptionInterval.MONTHLY]: 59,
    [V2SubscriptionInterval.YEARLY]: 590
  }
};

