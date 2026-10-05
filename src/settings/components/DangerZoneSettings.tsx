import * as React from "react";

import { t } from '../../lang/helpers';
import { InfioSettings } from '../../types/settings';

import CheckBoxSettingItem from "./CheckBoxSettingItem";
import SettingsItem from "./SettingsItem";

type Props = {
    settings: InfioSettings;
    updateSettings: (update: Partial<InfioSettings>) => void;
    onReset: () => void;
}

export default function DangerZoneSettings({ settings, updateSettings, onReset }: Props): React.JSX.Element {
    return (
        <>
            <SettingsItem
                name={t("settings.AutoComplete.dangerZone.factoryReset")}
                description={
                    t("settings.AutoComplete.dangerZone.factoryResetDescription")
                }
            >
                <button
                    aria-label="Reset to default settings"
                    onClick={onReset}
                >
                    {t("settings.AutoComplete.dangerZone.reset")}
                </button>
            </SettingsItem>
            <CheckBoxSettingItem
                name={t("settings.AutoComplete.dangerZone.advancedMode")}
                description={
                    t("settings.AutoComplete.dangerZone.advancedModeDescription")
                }
                enabled={settings.advancedMode}
                setEnabled={(value) => { updateSettings({ advancedMode: value }); }}
            />
        </>
    );
}
