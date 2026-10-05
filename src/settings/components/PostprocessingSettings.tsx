import * as React from "react";

import { t } from '../../lang/helpers';
import { InfioSettings } from '../../types/settings';

import CheckBoxSettingItem from "./CheckBoxSettingItem";

type Props = {
    settings: InfioSettings;
    updateSettings: (update: Partial<InfioSettings>) => void;
}

export default function PostprocessingSettings({ settings, updateSettings }: Props): React.JSX.Element {
    return (
        <>
            <CheckBoxSettingItem
                name={t("settings.AutoComplete.postprocessing.removeMathBlockIndicators")}
                description={
                    t("settings.AutoComplete.postprocessing.removeMathBlockIndicatorsDescription")
                }
                enabled={settings.removeDuplicateMathBlockIndicator}
                setEnabled={(value) => {
                    updateSettings({ removeDuplicateMathBlockIndicator: value })
                }}
            />
            <CheckBoxSettingItem
                name={t("settings.AutoComplete.postprocessing.removeCodeBlockIndicators")}
                description={
                    t("settings.AutoComplete.postprocessing.removeCodeBlockIndicatorsDescription")
                }
                enabled={settings.removeDuplicateCodeBlockIndicator}
                setEnabled={(value) => {
                    updateSettings({ removeDuplicateCodeBlockIndicator: value })
                }}
            />
        </>
    );
}
