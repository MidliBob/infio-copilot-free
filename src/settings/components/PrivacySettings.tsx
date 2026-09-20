import * as React from "react";

import { t } from '../../lang/helpers';
import { InfioSettings } from '../../types/settings';

import SettingsItem from "./SettingsItem";

type Props = {
    settings: InfioSettings;
    updateSettings: (update: Partial<InfioSettings>) => void;
    errors: Map<string, string>;
}

export default function PrivacySettings({ settings, updateSettings, errors }: Props): React.JSX.Element {
    return (
        <>
            <SettingsItem
                name={t("settings.AutoComplete.privacy.ignoredFiles")}
                description={
                    <div>
                        <p>{t("settings.AutoComplete.privacy.ignoredFilesDescription")}</p>
                        <ul>
                            <li><code>path/to/folder/**</code>: {t("settings.AutoComplete.privacy.ignoredFilesPattern1")}
                            </li>
                            <li><code>"**/secret/**"</code>: {t("settings.AutoComplete.privacy.ignoredFilesPattern2")}
                            </li>
                            <li><code>!path/to/folder/example.md</code>: {t("settings.AutoComplete.privacy.ignoredFilesPattern3")}
                            </li>
                            <li><code>**/*Python*.md</code>: {t("settings.AutoComplete.privacy.ignoredFilesPattern4")}
                            </li>
                        </ul>
                    </div>
                }
                display={"block"}
                errorMessage={errors.get("ignoredFilePatterns")}
            >
                <textarea
                    className="icf-autocomplete-setting-item-textarea"
                    rows={10}
                    placeholder={t("settings.AutoComplete.privacy.ignoredFilesPlaceholder")}
                    value={settings.ignoredFilePatterns}
                    onChange={(e) =>
                        updateSettings({
                            ignoredFilePatterns: e.target.value
                        })
                    }
                />
            </SettingsItem>
            <SettingsItem
                name={t("settings.AutoComplete.privacy.ignoredTags")}
                description={
                    <div>
                        <p>{t("settings.AutoComplete.privacy.ignoredTagsDescription")}
                        </p>
                    </div>
                }
                display={"block"}
                errorMessage={errors.get("ignoredTags")}
            >
                <textarea
                    className="icf-autocomplete-setting-item-textarea"
                    rows={10}
                    placeholder={t("settings.AutoComplete.privacy.ignoredTagsPlaceholder")}
                    value={settings.ignoredTags}
                    onChange={(e) =>
                        updateSettings({
                            ignoredTags: e.target.value
                        })
                    }
                />
            </SettingsItem>
        </>
    );
}
