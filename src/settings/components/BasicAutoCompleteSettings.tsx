import * as React from "react";

import { t } from '../../lang/helpers';
import { InfioSettings } from '../../types/settings';

import CheckBoxSettingItem from "./CheckBoxSettingItem";

type Props = {
    settings: InfioSettings;
    updateSettings: (update: Partial<InfioSettings>) => void;
}

export default function BasicAutoCompleteSettings({ settings, updateSettings }: Props): React.JSX.Element {
    return (
        <>
            <CheckBoxSettingItem
                name={t("settings.AutoComplete.enable")}
                description={
                    t("settings.AutoComplete.enableDescription")
                }
                enabled={settings.autocompleteEnabled}
                setEnabled={(value) => { updateSettings({ autocompleteEnabled: value }); }}
            />
            <CheckBoxSettingItem
                name={t("settings.AutoComplete.cacheCompletions")}
                description={
                    t("settings.AutoComplete.cacheCompletionsDescription")
                }
                enabled={settings.cacheSuggestions}
                setEnabled={(value) => { updateSettings({ cacheSuggestions: value }); }}
            />
            <CheckBoxSettingItem
                name={t("settings.AutoComplete.debugMode")}
                description={
                    t("settings.AutoComplete.debugModeDescription")
                }
                enabled={settings.debugMode}
                setEnabled={(value) => { updateSettings({ debugMode: value }); }}
            />
        </>
    );
}
