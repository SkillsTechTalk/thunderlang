export function flagState(
  flagEnabled: boolean,
  userAllowlisted: boolean,
  userInRolloutBucket: boolean,
  overrideToken: string,
): "On" | "Off" {
  if (!flagEnabled) return "Off";
  if (userAllowlisted) return "On";
  if (userInRolloutBucket) return "On";
  return "Off";
}
