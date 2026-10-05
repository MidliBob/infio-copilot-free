import * as React from "react";

import { t } from '../../lang/helpers';
import { InfioSettings } from '../../types/settings';
import {
	MAX_DELAY,
	MIN_DELAY,
} from "../versions";

import SliderSettingsItem from "./SliderSettingsItem";
import TriggerSettings from "./TriggerSettings";

type Props = {
    settings: InfioSettings;
    updateSettings: (update: Partial<InfioSettings>) => void;
    errors: Map<string, string>;
}

export default function TriggerSettingsSection({ settings, updateSettings, errors }: Props): React.JSX.Element {
    return (
        <>
            <SliderSettingsItem
                name={t("settings.AutoComplete.trigger.delay")}
                description={
                    t("settings.AutoComplete.trigger.delayDescription")
                }
                value={settings.delay}
                errorMessage={errors.get("delay")}
                setValue={(value: number) => { updateSettings({ delay: value }); }}
                min={MIN_DELAY}
                max={MAX_DELAY}
                step={100}
                suffix={t("settings.AutoComplete.trigger.ms")}
            />
            <TriggerSettings
                name={t("settings.AutoComplete.trigger.words")}
                description={
                    t("settings.AutoComplete.trigger.wordsDescription")
                }
                triggers={settings.triggers}
                setValues={(triggers) => { updateSettings({ triggers }); }}
                errorMessage={errors.get("triggerWords")}
                errorMessages={errors}
            />
        </>
    );
}
