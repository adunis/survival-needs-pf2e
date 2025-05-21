# Survival Needs PF2e

**Bring a deeper level of immersion and challenge to your Pathfinder 2e games with granular survival needs!**

<table>
  <tr>
    <td>
      <img src="https://github.com/user-attachments/assets/f49085ef-3901-4630-a40b-899423f0b554" alt="Image 1 Description" width="75%">
    </td>
    <td>
      <img src="https://github.com/user-attachments/assets/514904c4-ad37-49af-bb93-0f5c4e1769de" alt="Image 2 Description" width="75%">
    </td>
  </tr>
</table>


This module introduces a suite of configurable trackers for common survival elements like hunger, thirst, and sleep deprivation, along with more nuanced needs such as bladder and bowel relief, boredom, stress, and even wetness. Each tracker can impose progressive negative conditions on characters as their needs become more severe, all managed through dynamically applied effects.

## Features

*   **Configurable Trackers:**
    *   **Hunger:** From peckish to starving, impacting physical capabilities.
    *   **Thirst:** From thirsty to dangerously dehydrated, affecting strength and vitality.
    *   **Sleep Deprivation:** Progresses from tired to exhausted, clouding the mind and slowing reactions.
    *   **Bladder:** Fills as characters drink. High levels cause discomfort and clumsiness.
    *   **Bowels:** Fills as characters eat. High levels lead to discomfort and sluggishness.
    *   **Boredom:** Characters can become bored over time or from monotonous food, leading to mental fog.
    *   **Stress:** Can increase from various sources (dirty water, certain foods, game events). High stress impacts mental acuity and composure.
    *   **Wetness:** Manually tracked (e.g., after swimming or rain). Can lead to discomfort and penalties, especially if combined with cold.
*   **Dynamic Parent Effects:** Each stage of a need (e.g., "Thirsty," "Parched," "Dehydrated") is represented by a unique Parent Effect item applied to the actor. These parent effects are responsible for granting the actual gameplay conditions (like Fatigued, Enfeebled, Drained, etc.) with appropriate values. This ensures clean integration with other PF2e effects and allows external conditions to persist correctly.
*   **Time Integration:** Needs like Hunger, Thirst, and Sleep Deprivation can automatically increase over game time, based on a configurable interval (default: every 4 game hours).
*   **Item Consumption with Detail:**
    *   Eating and drinking reduce Hunger and Thirst.
    *   For generic food/drink, a dialog prompts the player for details (caloric content, taste, drink quality, alcoholic/potion status) which then influence multiple needs (Hunger, Thirst, Boredom, Stress, Piss, Poop).
    *   Standard items like "Rations" and "Waterskins" are consumed with 1 use and apply default, balanced effects without the detailed dialog.
    *   Effective bulk per use is calculated for items with multiple uses.
*   **Interactive Character Sheet Display:**
    *   A compact section is added to the PF2e Character Sheet (sidebar) showing current tracker values.
    *   Buttons for consuming relevant items (food for hunger, drink for thirst).
    *   Special action buttons for other trackers:
        *   **Bladder/Bowels:** "Urinate" and "Defecate" buttons to reset the trackers (takes in-game time, posts a chat message).
        *   **Sleep Deprivation:** A "Rest Options" button opens a dialog to choose between a Short Nap (minor recovery), Moderate Sleep (medium recovery), or initiating a Full Night's Rest (triggers PF2e long rest).
        *   **Boredom/Stress:** Buttons to "Alleviate Boredom" or "Reduce Stress" open dialogs with a variety of activities. Each choice has different impacts on boredom/stress, takes time, and may even affect other needs or lead to interesting roleplaying!
        *   **Wetness:** A "Dry Off" button to reset the tracker (takes time).
*   **Chat Feedback:** Consumption of items and use of special actions provide descriptive chat messages summarizing the effects.
*   **GM Configuration:**
    *   Enable/disable individual trackers.
    *   Set update interval for time-based needs.
    *   Toggle whether NPCs are affected.
    *   **Direct JSON editing** of tracker configurations, allowing GMs to customize:
        *   Max values, default values, increase per interval.
        *   Thresholds for each stage of a need.
        *   The `name` and `icon` for the Parent Effect of each stage.
        *   The `symptoms` (conditions like "fatigued", "drained", their slugs, and values) granted by each Parent Effect.
        *   Item filter keywords for consumption.
        *   Base restoration amounts for standard food/drink.
        *   Regeneration on long rest.
        *   Inter-tracker dependencies (e.g., how Piss/Poop increase with Thirst/Hunger reduction).
        *   Definitions for `specialActions` including button labels, icons, time taken, effects, and choices for dialog-based actions.

## Installation

1.  Put this link https://github.com/adunis/survival-needs-pf2e/releases/latest/download/module.json into the Foundry Manifest URL field
2.  Enable the module in your game world.

## Configuration

Access module settings via `Game Settings -> Module Settings -> Survival Needs PF2e`.

*   **Update Interval (Game Hours):** How often (in game world hours) time-based needs like Hunger, Thirst, and Sleep Deprivation should increase. Default: 4 hours.
*   **Track Needs for NPCs:** If checked, NPCs will also be subject to these survival needs. Default: false.
*   **Tracker Configurations (JSON):**
    *   This is an advanced setting allowing direct editing of the JSON array that defines all trackers.
    *   **Caution:** Editing this JSON requires care. Invalid JSON can cause errors or reset trackers to default.
    *   The structure includes:
        *   `id`, `name`, `enabled`, `iconClass` (for sheet display), `iconColor`, `defaultValue`, `maxValue`, `increasePerInterval`.
        *   `thresholdEffects`: An array, where each object defines a stage:
            *   `threshold`: Value at which this stage activates.
            *   `name`: Name of the stage (e.g., "Peckish"). Used for the Parent Effect item.
            *   `icon`: Path to the icon for this Parent Effect item (e.g., `modules/survival-needs-pf2e/icons/Status_Hunger.png`).
            *   `symptoms`: Array of `{slug: "condition-slug", value: X}` objects defining conditions granted by this stage's Parent Effect.
        *   `regeneration`: Config for item consumption and long rest.
            *   `itemFilter`: `types` (e.g., `["consumable"]`) and `nameKeywords` (e.g., `["food", "ration"]`).
            *   `itemRestoreAmount`: Base amount one "standard use" restores (e.g., for Hunger, 3.33; for Thirst, 20).
        *   `decreaseWhenOtherTrackerDecreases` (for Piss/Poop - DEPRECATED, logic is now hardcoded x2 for piss, x6 for poop based on actual thirst/hunger reduction):
            *   `sourceTrackerId`: The ID of the tracker that, when decreased, affects this one.
            *   `increaseThisTrackerByPercentageOfOther`: How much this tracker increases relative to the decrease of the source.
        *   `specialActions`: Array of objects for buttons on the character sheet.
            *   `actionId`: Unique internal ID.
            *   `label`: Tooltip/button text.
            *   `icon`: Font Awesome class for the button icon.
            *   `timeMinutes`: In-game time the action takes.
            *   `reducesTo`: Value the tracker is set to (e.g., 0).
            *   `reducesBy`: Amount the tracker is reduced by.
            *   `chatMessage`: Message template.
            *   `opensChoicesDialog`: `true` if it opens a dialog.
            *   `choices`: Array for dialog options, each with `id`, `label`, `timeMinutes`, `reducesBy`, `chatMessage`, and potentially `stressChange` or `boredomChange`.
            *   `triggersLongRest`: `true` if the action should initiate a PF2e Long Rest.

## How to Use

1.  **Enable Trackers:** In module settings, ensure desired trackers are enabled in the JSON configuration (or wait for a UI if developed). By default, Hunger, Thirst, Sleep, Piss, Poop, Boredom, Stress, and Wetness are configured.
2.  **Character Sheet:** Relevant characters (and NPCs if enabled) will show a "Survival Needs" section on their character sheet sidebar.
    *   Values can be manually adjusted by players/GM.
    *   "Eat," "Drink," and other special action buttons will appear next to relevant trackers.
3.  **Time Advancement:** As game time passes (via the PF2e World Clock), configured needs will automatically increase.
4.  **Effects:** When a tracker crosses a threshold defined in its `thresholdEffects`, a "Parent Effect" (e.g., "Thirst: Parched") will be added to the actor. This Parent Effect then grants the actual gameplay conditions (e.g., Enfeebled 1). Removing the Parent Effect (e.g., by drinking water to lower Thirst) will remove the granted conditions (unless another source is providing them).

## For Developers / Customization

*   **Parent Effect Icons:** Icons for threshold effects are defined in `constants.js` and can be overridden in the settings JSON. Ensure paths are correct.
*   **Condition Granting:** Parent Effects use PF2e `GrantItem` rule elements. The `_buildDynamicEffectData` method in `ConditionManagerV2` looks up condition UUIDs using `game.pf2e.ConditionManager.getCondition(slug)`. Values are set using `alterations` on the `GrantItem` rule, targeting `badge-value`.
*   **Adding New Trackers:** Add new tracker definitions to the `DEFAULT_TRACKER_CONFIGS` array in `constants.js` or directly edit the settings JSON. You'll need to define its `id`, `name`, thresholds, symptoms, icons, etc. If it has special button logic, you'll need to add handling for its `actionId` in `SheetIntegration.js` and `NeedsManager.js`.

## Known Issues / Future Ideas

*   Currently, the "time taken" for special actions is for flavor via chat message; it doesn't automatically advance game time. Multiple players can do multiple actions in same time frame, advancing time automatically is always troublesome. 
*   Detailed UI for configuring all aspects of trackers (thresholds, symptoms, icons, special actions, choices) via `TrackerConfigApp` is a future goal. Currently, advanced configuration requires direct JSON editing.
*   More nuanced interactions between needs (e.g., being Wet in cold weather increasing Stress or affecting Thirst differently).
*   Integration with weather systems.

## Credits

*   **Author:** Aleksandar Petrovic
*   Utilizes the robust Pathfinder 2e system on Foundry VTT.

