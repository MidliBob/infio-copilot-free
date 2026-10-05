import * as React from "react";

import { t } from '../../lang/helpers';
import { InfioSettings } from '../../types/settings';
import {
	MAX_MAX_CHAR_LIMIT,
	MIN_MAX_CHAR_LIMIT,
} from "../versions";

import CheckBoxSettingItem from "./CheckBoxSettingItem";
import SliderSettingsItem from "./SliderSettingsItem";

type Props = {
    settings: InfioSettings;
    updateSettings: (update: Partial<InfioSettings>) => void;
    errors: Map<string, string>;
}

export default function PreprocessingSettings({ settings, updateSettings, errors }: Props): React.JSX.Element {
    return (
        <>
            <CheckBoxSettingItem
                name={t("settings.AutoComplete.preprocessing.excludeDataview")}
                description={
                    t("settings.AutoComplete.preprocessing.excludeDataviewDescription")
                }
                enabled={settings.dontIncludeDataviews}
                setEnabled={(value) => {
                    updateSettings({ dontIncludeDataviews: value })
                }}
            />
            <SliderSettingsItem
                name={t("settings.AutoComplete.preprocessing.maxPrefixLength")}
                description={
                    t("settings.AutoComplete.preprocessing.maxPrefixLengthDescription")
                }
                value={settings.maxPrefixCharLimit}
                errorMessage={errors.get("maxPrefixCharLimit")}
                setValue={(value: number) => {
                    updateSettings({ maxPrefixCharLimit: value })
                }}
                min={MIN_MAX_CHAR_LIMIT}
                max={MAX_MAX_CHAR_LIMIT}
                step={100}
                suffix={t("settings.AutoComplete.preprocessing.chars")}
            />
            <SliderSettingsItem
                name={t("settings.AutoComplete.preprocessing.maxSuffixLength")}
                description={
                    t("settings.AutoComplete.preprocessing.maxSuffixLengthDescription")
                }
                value={settings.maxSuffixCharLimit}
                errorMessage={errors.get("maxSuffixCharLimit")}
                setValue={(value: number) => {
                    updateSettings({ maxSuffixCharLimit: value })
                }}
                min={MIN_MAX_CHAR_LIMIT}
                max={MAX_MAX_CHAR_LIMIT}
                step={100}
                suffix={t("settings.AutoComplete.preprocessing.chars")}
            />
        </>
    );
}
