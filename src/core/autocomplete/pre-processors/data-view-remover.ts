import { PreProcessor, PrefixAndSuffix } from "../types";
import { generateRandomString } from "../utils";

const DATA_VIEW_REGEX = /```dataview(js){0,1}(.|\n)*?```/gm;
const UNIQUE_CURSOR = `${generateRandomString(16)}`;

class DataViewRemover implements PreProcessor {
  process(prefix: string, suffix: string): PrefixAndSuffix {
    let text = prefix + UNIQUE_CURSOR + suffix;
    text = text.replace(DATA_VIEW_REGEX, "");
    const [prefixNew, suffixNew] = text.split(UNIQUE_CURSOR);

    return { prefix: prefixNew, suffix: suffixNew };
  }

  removesCursor(prefix: string, suffix: string): boolean {
    const text = prefix + UNIQUE_CURSOR + suffix;
    const dataviewAreasWithCursor = text
      .match(DATA_VIEW_REGEX)
      ?.filter((dataviewArea) => dataviewArea.includes(UNIQUE_CURSOR));

    if (
      dataviewAreasWithCursor !== undefined &&
      dataviewAreasWithCursor.length > 0
    ) {
      return true;
    }

    return false;
  }
}

export default DataViewRemover;
