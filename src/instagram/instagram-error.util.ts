// src/instagram/instagram-error.util.ts

export interface InstagramApiError {
  code: number;
  subcode?: number;
  message: string;
  userTitle?: string;
  userMessage?: string;
  recommendedAction?: string;
}

const errorMap: Record<number, Record<number, Omit<InstagramApiError, 'code' | 'subcode'>>> = {
  [-2]: {
    2207003: {
      message: "It takes too long to download the media.",
      userTitle: "Timeout",
      userMessage: "A timeout occurred while downloading the media. Try again.",
      recommendedAction: "Try again.",
    },
    2207020: {
      message: "The media you are trying to access has expired.",
      userTitle: "Media Expired",
      userMessage: "The media has expired. Please upload again.",
      recommendedAction: "Generate a new container ID and try again.",
    },
  },
  [-1]: {
    2207001: {
      message: "Instagram server error.",
      userTitle: "Server Error",
      userMessage: "Instagram server error. Try again.",
      recommendedAction: "Try again.",
    },
    2207032: {
      message: "Create media fail, please try to re-create media.",
      userTitle: "Create Media Failed",
      userMessage: "Failed to create a media container. Try again.",
      recommendedAction: "Try again.",
    },
    2207053: {
      message: "Unknown upload error.",
      userTitle: "Upload Error",
      userMessage: "An unknown error occurred during upload. Try again.",
      recommendedAction: "Generate a new container and try again.",
    },
  },
  [1]: {
    2207057: {
      message: "Thumbnail offset out of bounds.",
      userTitle: "Thumbnail Offset Error",
      userMessage: "The thumbnail offset is out of bounds for the video duration.",
      recommendedAction: "Add the right offset in milliseconds.",
    },
  },
  [4]: {
    2207051: {
      message: "Activity restricted as spam.",
      userTitle: "Restricted Activity",
      userMessage: "The publishing action is suspected to be spam.",
      recommendedAction: "Contact support if this is a mistake.",
    },
  },
  [9]: {
    2207042: {
      message: "Daily publishing limit reached.",
      userTitle: "Rate Limit",
      userMessage: "You reached the maximum number of posts allowed today.",
      recommendedAction: "Try again tomorrow.",
    },
  },
  [24]: {
    2207006: {
      message: "Media cannot be found.",
      userTitle: "Media Not Found",
      userMessage: "The media cannot be found. Possible permission error.",
      recommendedAction: "Generate a new container and try again.",
    },
    2207008: {
      message: "Media builder does not exist or expired.",
      userTitle: "Container Expired",
      userMessage: "Temporary error publishing a container. Try again.",
      recommendedAction: "Try again 1–2 times in the next 30 seconds to 2 minutes.",
    },
  },
  [25]: {
    2207050: {
      message: "Instagram account is restricted.",
      userTitle: "Account Restricted",
      userMessage: "Your Instagram Professional account is inactive or restricted.",
      recommendedAction: "Sign in to Instagram and complete any required actions.",
    },
  },
  [100]: {
    2207023: {
      message: "Unknown media type.",
      userTitle: "Media Type Error",
      userMessage: "The media type is not valid.",
      recommendedAction: "Use a valid media type.",
    },
    2207028: {
      message: "Invalid carousel size.",
      userTitle: "Carousel Error",
      userMessage: "Carousels need 2-10 photos/videos.",
      recommendedAction: "Use an acceptable number of items.",
    },
    2207035: {
      message: "Product tag positions not allowed for video.",
      userTitle: "Tag Error",
      userMessage: "Videos do not support X/Y coordinates.",
      recommendedAction: "Disallow X/Y coordinates with videos.",
    },
    2207036: {
      message: "Product tag positions required for photo.",
      userTitle: "Tag Error",
      userMessage: "Image product tags must include X/Y coordinates.",
      recommendedAction: "Require X/Y coordinates for images.",
    },
    2207037: {
      message: "Invalid product tag.",
      userTitle: "Product Tag Error",
      userMessage: "One or more product tags are invalid.",
      recommendedAction: "Use only eligible product IDs.",
    },
    2207040: {
      message: "Too many tags.",
      userTitle: "Tag Limit",
      userMessage: "Exceeded the maximum number of @ tags.",
      recommendedAction: "Use fewer @ tags.",
    },
  },
  [352]: {
    2207026: {
      message: "Unsupported video format.",
      userTitle: "Format Error",
      userMessage: "The video format is not supported.",
      recommendedAction: "Upload an MOV or MP4.",
    },
  },
  [9004]: {
    2207052: {
      message: "Media could not be fetched from URI.",
      userTitle: "Media Fetch Error",
      userMessage: "The media could not be fetched from the supplied URI.",
      recommendedAction: "Ensure the URI is valid and public.",
    },
  },
  [9007]: {
    2207027: {
      message: "Media not ready for publishing.",
      userTitle: "Media Not Ready",
      userMessage: "The media is not ready for publishing. Please wait.",
      recommendedAction: "Check the container status and publish when ready.",
    },
  },
  [36000]: {
    2207004: {
      message: "Image size too large.",
      userTitle: "Image size too large",
      userMessage: "The image is too large to download. It should be less than 8 MiB.",
      recommendedAction: "Try again with a smaller image.",
    },
  },
  [36001]: {
    2207005: {
      message: "Unsupported image format.",
      userTitle: "Format Error",
      userMessage: "The image format is not supported.",
      recommendedAction: "Use a supported format.",
    },
  },
  [36003]: {
    2207009: {
      message: "Invalid image aspect ratio.",
      userTitle: "Aspect Ratio Error",
      userMessage: "The image's aspect ratio is not valid.",
      recommendedAction: "Use an image with a 4:5 to 1.91:1 aspect ratio.",
    },
  },
  [36004]: {
    2207010: {
      message: "Caption too long.",
      userTitle: "Caption Length Error",
      userMessage: "The caption is too long.",
      recommendedAction: "Use a shorter caption (max 2,200 characters, 30 hashtags, 20 @ tags).",
    },
  },
};

export function mapInstagramApiError(error: any): InstagramApiError {
  const code = error?.code;
  const subcode = error?.error_subcode;
  if (code && subcode && errorMap[code] && errorMap[code][subcode]) {
    return {
      code,
      subcode,
      ...errorMap[code][subcode],
    };
  }
  // Fallback for unknown errors
  return {
    code: code || 0,
    subcode,
    message: error?.message || 'Unknown Instagram API error',
    userTitle: error?.error_user_title,
    userMessage: error?.error_user_msg || error?.message,
    recommendedAction: 'Check the error details and try again.',
  };
}
