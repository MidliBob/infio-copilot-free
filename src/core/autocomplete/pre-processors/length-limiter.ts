import { PreProcessor, PrefixAndSuffix } from "../types";

class LengthLimiter implements PreProcessor {
  private readonly maxPrefixChars: number;
  private readonly maxSuffixChars: number;

  constructor(maxPrefixChars: number, maxSuffixChars: number) {
    this.maxPrefixChars = maxPrefixChars;
    this.maxSuffixChars = maxSuffixChars;
  }

  process(prefix: string, suffix: string): PrefixAndSuffix {
    prefix = prefix.slice(-this.maxPrefixChars);
    suffix = suffix.slice(0, this.maxSuffixChars);
    return { prefix, suffix };
  }

  removesCursor(): boolean {
    return false;
  }
}

export default LengthLimiter;
