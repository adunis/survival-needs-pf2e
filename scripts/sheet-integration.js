// File: scripts/sheet-integration.js

import { MODULE_ID, FLAG_PREFIX, DEFAULT_TRACKER_CONFIGS } from "./constants.js"; // Assuming DEFAULT_TRACKER_CONFIGS is for fallback in onRenderCharacterSheet

export class SheetIntegration {
    constructor(needsManagerInstance) {
        this.needsManager = needsManagerInstance;
        const logPrefix = `%c[${MODULE_ID} | SheetIntegration]`;
        const constructorStyle = "color: olive; font-weight:bold;";
        
        if (!this.needsManager || typeof this.needsManager.loadAllConfigs !== 'function') {
            console.error(`${logPrefix} CRITICAL: Invalid NeedsManager instance passed to constructor! SheetIntegration may not work.`, "color:red;", needsManagerInstance);
            this.needsManager = null; 
        } else {
            console.log(`${logPrefix} Constructed with NeedsManager. Version: Full_Corrected_V1.3`, constructorStyle);
        }
    }

    /**
     * Called when a CharacterSheetPF2e is rendered.
     * Injects the survival needs display into the sheet and binds events.
     */
    async onRenderCharacterSheet(app, html, actorData) {
        const actor = app.actor; 
        const logPrefixFunc = (actorName) => `%c[${MODULE_ID} | SheetIntegration | ${actorName || 'UnknownActor'} | Render]`;
        const warningStyle = "color:orange; font-weight:bold;";
        const detailStyle = "color: olive;";
        const errorStyle = "color:red; font-weight:bold;";

        if (!actor || actor.type !== "character") return; 
        if (!html || html.length === 0) return;

        if (!this.needsManager || typeof this.needsManager.loadAllConfigs !== 'function') {
            console.error(logPrefixFunc(actor.name) + " CRITICAL: NeedsManager instance is not available in onRenderCharacterSheet. Aborting.", errorStyle);
            return;
        }

        this.needsManager.loadAllConfigs(); 
        
        if (!this.needsManager.trackerConfigs || !Array.isArray(this.needsManager.trackerConfigs)) {
            console.error(logPrefixFunc(actor.name) + ` CRITICAL: trackerConfigs is not a valid array after loadAllConfigs.`, errorStyle, this.needsManager.trackerConfigs);
            // Attempt a hard fallback if constants are available
            if (typeof DEFAULT_TRACKER_CONFIGS !== 'undefined' && Array.isArray(DEFAULT_TRACKER_CONFIGS)) {
                 this.needsManager.trackerConfigs = foundry.utils.deepClone(DEFAULT_TRACKER_CONFIGS).filter(tc => tc.enabled === true);
                 console.warn(logPrefixFunc(actor.name) + ` Forcibly reset trackerConfigs to default in SheetIntegration.`, warningStyle);
            } else {
                console.error(logPrefixFunc(actor.name) + ` DEFAULT_TRACKER_CONFIGS not available for fallback. Cannot render needs display.`, errorStyle);
                return;
            }
        }
        
        const enabledTrackers = this.needsManager.trackerConfigs.filter(tc => tc.enabled === true);
        const sheetDisplayElement = html.find(`.survival-needs-display.${MODULE_ID}`);

        if (enabledTrackers.length === 0) {
            sheetDisplayElement.remove();
            return;
        }

        const currentNeeds = this.needsManager.getActorNeeds(actor);
        const templateTrackers = enabledTrackers.map(tracker => ({
            ...tracker, 
            currentValue: currentNeeds[tracker.id] ?? tracker.defaultValue ?? 0,
            flagPath: `${FLAG_PREFIX}.${tracker.id}`,
            specialActions: tracker.specialActions || [] 
        }));

        const templateData = { moduleId: MODULE_ID, actorId: actor.id, trackers: templateTrackers };
        const content = await renderTemplate(`modules/${MODULE_ID}/templates/needs-display.hbs`, templateData);

        if (sheetDisplayElement.length > 0) {
            sheetDisplayElement.replaceWith(content);
        } else {
            let injectionSuccessful = false;
            const targets = ['aside > div.sidebar[data-tab="sidebar"] ul.saves', 'aside > div.sidebar[data-tab="sidebar"] section.perception', 'aside > div.sidebar[data-tab="sidebar"] header:has(h2:contains("Immunities"))', 'aside > div.sidebar[data-tab="sidebar"]', 'form > aside.sidebar', 'form aside'];
            for (const selector of targets) {
                const el = html.find(selector);
                if (el.length > 0) {
                    if (selector.includes('ul.saves') || selector.includes('section.perception')) el.after(content);
                    else if (selector.includes('header:has')) el.before(content);
                    else el.append(content); 
                    injectionSuccessful = true;
                    break;
                }
            }
            if (!injectionSuccessful) { console.warn(logPrefixFunc(actor.name) + ` Could not inject needs display.`, warningStyle); return; }
        }
        const newDisplayElement = html.find(`.survival-needs-display.${MODULE_ID}`);
        this._bindSheetEvents(actor, newDisplayElement, enabledTrackers);
    }

    _bindSheetEvents(actor, displayElement, enabledTrackers) {
        const logPrefixBase = `%c[${MODULE_ID} | SheetIntegration | ${actor.name} | Events]`;
        const warningStyle = "color:orange; font-weight:bold;";

        displayElement.find('input[type="number"].tracker-value-input').off('change.survivalNeeds').on('change.survivalNeeds', async event => {
            const input = event.currentTarget;
            const trackerId = $(input).data('trackerId');
            if (!trackerId) { console.warn(`${logPrefixBase} Input change: No trackerId.`, warningStyle); return; }
            const newValue = Number(input.value) || 0;
            await this.needsManager.updateNeedValue(actor, trackerId, newValue);
        });

        for (const tracker of enabledTrackers) {
            if (tracker.regeneration?.byItem) {
                displayElement.find(`.consume-button[data-tracker-id="${tracker.id}"]`).off('click.survivalNeeds').on('click.survivalNeeds', event => {
                    event.preventDefault(); this._handleConsumeItem(actor, tracker);
                });
            }
            if (tracker.specialActions) {
                tracker.specialActions.forEach(actionConfig => {
                    if (!actionConfig || !actionConfig.actionId) { console.warn(`${logPrefixBase} Invalid actionConfig for tracker ${tracker.id}`, warningStyle); return; }
                    displayElement.find(`.special-action-button[data-tracker-id="${tracker.id}"][data-action-id="${actionConfig.actionId}"]`)
                        .off('click.survivalNeeds').on('click.survivalNeeds', event => {
                            event.preventDefault(); this._handleSpecialAction(actor, tracker, actionConfig);
                        });
                });
            }
        }
    }

  async _handleConsumeItem(actor, trackerConfig) {
        const logPrefixFunc = (actorName) => `%c[${MODULE_ID} | SheetIntegration | ${actorName || 'UnknownActor'} | ConsumeItem_V1.6_EnsureDialog]`;
        const detailStyle = "color: olive; font-weight:bold;"; // Make important logs bold
        const warningStyle = "color:orange; font-weight:bold;";
        const errorStyle = "color:red; font-weight:bold;";
        const debugStyle = "color:blue;";

        if (!actor || !trackerConfig || !trackerConfig.regeneration?.byItem) {
            console.warn(logPrefixFunc(actor.name) + ` Invalid call. Aborting.`, warningStyle);
            return;
        }
        console.log(logPrefixFunc(actor.name) + ` Initiating consumption for tracker '${trackerConfig.id}'.`, detailStyle);

        const itemRegenConfig = trackerConfig.regeneration;
        const itemFilter = itemRegenConfig.itemFilter || {};
        const filterTypes = (Array.isArray(itemFilter.types) && itemFilter.types.length > 0 ? itemFilter.types : ["consumable"]).map(t => t.toLowerCase().trim()).filter(Boolean);
        const nameKeywords = (Array.isArray(itemFilter.nameKeywords) ? itemFilter.nameKeywords : []).map(k => k.toLowerCase().trim()).filter(Boolean);
        
        const suitableItems = actor.items.filter(item => {
            if (!filterTypes.includes(item.type.toLowerCase())) return false;
            const quantity = item.system.quantity;
            const uses = item.system.uses; 
            let isUsable = true;
            if (uses && typeof uses.value === 'number' && typeof uses.max === 'number') { 
                if (uses.value <= 0) isUsable = false;
            } else if (item.type === "consumable") { 
                if (quantity == null || quantity <= 0) isUsable = false;
            } else if (item.type !== "consumable" && itemFilter.types.includes(item.type.toLowerCase())) {
                 if (!uses && typeof quantity === 'number' && quantity <= 0) isUsable = false;
                 else if (uses && typeof uses.value === 'number' && uses.value <=0) isUsable = false;
            }
            if (!isUsable) return false;
            if (nameKeywords.length > 0) { if (!nameKeywords.some(keyword => item.name.toLowerCase().includes(keyword))) return false; }
            return true;
        });

        if (suitableItems.length === 0) { ui.notifications.warn(game.i18n.format(`${MODULE_ID}.notifications.noSuitableItem`, { actorName: actor.name, trackerName: trackerConfig.name })); return; }

        let optionsHtml = suitableItems.map(item => {
            // ... (Bulk calculation logic as in the previous complete version - this part was good) ...
            const uses = item.system.uses;
            const hasDefinedUses = uses && typeof uses.value === 'number' && typeof uses.max === 'number';
            let usesString = hasDefinedUses ? ` (${uses.value}/${uses.max} ${uses.per || 'uses'})` : "";
            let quantityString = (item.type === "consumable" && item.system.quantity != null && !hasDefinedUses) ? ` (x${item.system.quantity})` : "";
            let itemTotalBulk = 0;
            if (item.bulk?.isLight) { itemTotalBulk = item.bulk.light * 0.1; } 
            else if (item.bulk?.value) { itemTotalBulk = item.bulk.value; } 
            else if (typeof item.system.bulk?.value === 'number') { itemTotalBulk = item.system.bulk.value;} 
            else if (item.system.bulk?.light) { itemTotalBulk = item.system.bulk.light * 0.1;} 
            else if (item.type === "consumable" && (!item.system.bulk || itemTotalBulk === 0) && !hasDefinedUses) { itemTotalBulk = 0.1; }
            let effectiveBulkPerUse = itemTotalBulk; 
            if (hasDefinedUses && uses.max > 0) { effectiveBulkPerUse = itemTotalBulk / uses.max; }
            effectiveBulkPerUse = Math.max(0.01, Number(effectiveBulkPerUse.toFixed(3))); 
            return `<option value="${item.id}" data-effective-bulk="${effectiveBulkPerUse}" data-has-uses="${hasDefinedUses}">${item.name}${usesString}${quantityString}</option>`;
        }).join("");

        const itemDialogContent = `<form><p>${game.i18n.format(`${MODULE_ID}.dialogs.consumeItem.prompt`, { trackerName: trackerConfig.name })}</p><div class="form-group"><label for="${MODULE_ID}-item-select">${game.i18n.localize("SURVIVAL_NEEDS.dialogs.selectItemLabel")}:</label><select name="itemId" id="${MODULE_ID}-item-select" style="width: 100%; margin-top: 5px;">${optionsHtml}</select></div></form>`;

        new Dialog({
            title: itemRegenConfig.itemButtonLabel || game.i18n.format(`${MODULE_ID}.dialogs.consumeItem.title`, { trackerName: trackerConfig.name }),
            content: itemDialogContent,
            buttons: {
                next: { 
                    icon: '<i class="fas fa-arrow-right"></i>', label: game.i18n.localize("SURVIVAL_NEEDS.buttons.next"),
                    callback: async (html) => {
                        const selectedOption = html.find('select[name="itemId"] option:selected');
                        const itemId = selectedOption.val();
                        const itemEffectiveBulk = parseFloat(selectedOption.data('effective-bulk')); 
                        const itemHasUses = String(selectedOption.data('has-uses')) === 'true';

                        if (!itemId) return;
                        const itemToConsume = actor.items.get(itemId);
                        if (!itemToConsume) { ui.notifications.error(game.i18n.localize(`${MODULE_ID}.notifications.itemNotFound`)); return; }

                        console.log(logPrefixFunc(actor.name) + ` Selected: ${itemToConsume.name}, EffectiveBulk/Use: ${itemEffectiveBulk}, HasUses: ${itemHasUses}`, debugStyle);

                        const itemNameLower = itemToConsume.name.toLowerCase();
                        const itemSlug = itemToConsume.system.slug?.toLowerCase() || ""; 

                        // --- VERY STRICT Standard Item Check using SLUGS primarily ---
                        const standardRationSlugs = ["rations", "ration"]; // KEEP THIS LIST VERY SHORT AND SPECIFIC
                        const standardWaterskinSlugs = ["waterskin", "canteen"]; // KEEP THIS LIST VERY SHORT

                        let isStrictlyStandardItem = false;
                        let consumptionDataDefaults = {}; // Only used if isStrictlyStandardItem is true

                        if (trackerConfig.id === 'hunger' && standardRationSlugs.includes(itemSlug)) {
                            isStrictlyStandardItem = true;
                            consumptionDataDefaults = { taste: "boring", caloricType: "medium" };
                        } else if (trackerConfig.id === 'thirst' && standardWaterskinSlugs.includes(itemSlug)) {
                            isStrictlyStandardItem = true;
                            consumptionDataDefaults = { drinkQuality: "average", isAlcoholic: false, isPotion: false, drinkCaloric: "none" };
                        }
                        
                        // Fallback to very exact name match if slug didn't hit (less preferred)
                        if (!isStrictlyStandardItem) {
                            if (trackerConfig.id === 'hunger' && (itemNameLower === "ration" || itemNameLower === "rations")) {
                                isStrictlyStandardItem = true;
                                consumptionDataDefaults = { taste: "boring", caloricType: "medium" };
                            } else if (trackerConfig.id === 'thirst' && (itemNameLower === "waterskin" || itemNameLower === "canteen")) {
                                isStrictlyStandardItem = true;
                                consumptionDataDefaults = { drinkQuality: "average", isAlcoholic: false, isPotion: false, drinkCaloric: "none" };
                            }
                        }
                        
                        console.log(logPrefixFunc(actor.name) + ` Is Strictly Standard Item: ${isStrictlyStandardItem}`, debugStyle);

                        if (isStrictlyStandardItem) {
                            console.log(logPrefixFunc(actor.name) + ` Standard item '${itemToConsume.name}' confirmed. Processing with defaults.`, detailStyle);
                            const consumptionData = {
                                item: itemToConsume, itemIcon: itemToConsume.img, itemName: itemToConsume.name,
                                itemBulk: itemEffectiveBulk, originalTrackerId: trackerConfig.id,
                                baseRestoreAmount: itemRegenConfig.itemRestoreAmount, 
                                isStandard: true, hasUses: itemHasUses,
                                ...consumptionDataDefaults 
                            };
                            let consumptionSuccessful = await this._consumeOneUseOrQuantity(actor, itemToConsume, itemHasUses, logPrefixFunc(actor.name));
                            if (consumptionSuccessful) await this.needsManager.processDetailedConsumption(actor, consumptionData);
                            else ui.notifications.warn(game.i18n.format("SURVIVAL_NEEDS.notifications.couldNotConsumeUse", {itemName: itemToConsume.name}));
                        } else {
                            // *** THIS IS THE PATH MOST ITEMS (like "Oil") SHOULD TAKE ***
                            console.log(logPrefixFunc(actor.name) + ` Item '${itemToConsume.name}' NOT strictly standard. Proceeding to details dialog.`, detailStyle);
                            this._showConsumptionDetailsDialog(actor, trackerConfig, itemToConsume, itemEffectiveBulk, itemRegenConfig, itemHasUses);
                        }
                    }
                },
                cancel: { icon: '<i class="fas fa-times-circle"></i>', label: game.i18n.localize("Cancel") }
            },
            default: "next"
        }).render(true);
    }
 async _showConsumptionDetailsDialog(actor, trackerConfig, itemToConsume, itemEffectiveBulk, itemRegenConfig, itemHasUses) {
        const logPrefixFunc = (actorName) => `%c[${MODULE_ID} | SheetIntegration | ${actorName || 'UnknownActor'} | ConsumptionDetails]`;
        const isFood = trackerConfig.id === 'hunger';
        const isDrink = trackerConfig.id === 'thirst';
        
        let detailsFormHtml = `<form><p>${game.i18n.format("SURVIVAL_NEEDS.dialogs.consumeDetails.prompt", {itemName: itemToConsume.name, itemBulk: itemEffectiveBulk.toFixed(3) })}</p>`; // Added <form> tag

        if (isFood) {
            detailsFormHtml += `
                <div class="form-group">
                    <label for="caloricType">${game.i18n.localize("SURVIVAL_NEEDS.dialogs.food.caloricType")}:</label>
                    <select name="caloricType" id="caloricType">
                        <option value="low">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.lowCaloric")}</option>
                        <option value="medium" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.food.mediumCaloric")}</option>
                        <option value="high">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.highCaloric")}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="taste">${game.i18n.localize("SURVIVAL_NEEDS.dialogs.food.taste")}:</label>
                    <select name="taste" id="taste">
                        <option value="boring">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.boring")}</option>
                        <option value="average" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.food.average")}</option>
                        <option value="interesting">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.interesting")}</option>
                    </select>
                </div>
            `;
        } else if (isDrink) {
            detailsFormHtml += `
                <div class="form-group">
                    <label for="drinkQuality">${game.i18n.localize("SURVIVAL_NEEDS.dialogs.drink.quality")}:</label>
                    <select name="drinkQuality" id="drinkQuality">
                        <option value="dirty">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.dirty")}</option>
                        <option value="average" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.average")}</option>
                        <option value="purified">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.purified")}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="drinkCaloric">${game.i18n.localize("SURVIVAL_NEEDS.dialogs.drink.caloricContent")}:</label>
                    <select name="drinkCaloric" id="drinkCaloric">
                        <option value="none" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.caloricNone")}</option>
                        <option value="slight">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.caloricSlight")}</option>
                        <option value="high">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.caloricHigh")}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="isAlcoholic">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.isAlcoholic")}:</label>
                    <input type="checkbox" name="isAlcoholic" id="isAlcoholic">
                </div>
                <div class="form-group">
                    <label for="isPotion">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.isPotion")}:</label>
                    <input type="checkbox" name="isPotion" id="isPotion">
                </div>
            `;
        }
        detailsFormHtml += `</form>`; // Close the <form> tag

        new Dialog({
            title: game.i18n.format("SURVIVAL_NEEDS.dialogs.consumeDetails.title", {itemName: itemToConsume.name}),
            content: detailsFormHtml, // <--- CORRECTED VARIABLE NAME
            buttons: {
                consume: {
                    icon: '<i class="fas fa-check-circle"></i>', label: game.i18n.localize(`${MODULE_ID}.dialogs.consumeItem.consumeButton`),
                    callback: async (html) => { // html here is the jQuery object for the dialog's content
                        const consumptionData = {
                            item: itemToConsume, itemIcon: itemToConsume.img, itemName: itemToConsume.name,
                            itemBulk: itemEffectiveBulk, originalTrackerId: trackerConfig.id,
                            baseRestoreAmount: itemRegenConfig.itemRestoreAmount, isStandard: false, hasUses: itemHasUses,
                            caloricType: isFood ? html.find('select[name="caloricType"]').val() : undefined,
                            taste: isFood ? html.find('select[name="taste"]').val() : undefined,
                            drinkQuality: isDrink ? html.find('select[name="drinkQuality"]').val() : undefined,
                            isAlcoholic: isDrink ? html.find('input[name="isAlcoholic"]').is(':checked') : false,
                            isPotion: isDrink ? html.find('input[name="isPotion"]').is(':checked') : false,
                            drinkCaloric: isDrink ? html.find('select[name="drinkCaloric"]').val() : "none",
                        };
                        let consumptionSuccessful = await this._consumeOneUseOrQuantity(actor, itemToConsume, itemHasUses, logPrefixFunc(actor.name));
                        if (consumptionSuccessful) await this.needsManager.processDetailedConsumption(actor, consumptionData);
                        else ui.notifications.error(game.i18n.format("SURVIVAL_NEEDS.notifications.couldNotConsumeUse", {itemName: itemToConsume.name})); // Consider a specific notification key
                    }
                },
                cancel: { icon: '<i class="fas fa-times-circle"></i>', label: game.i18n.localize("Cancel") }
            },
            default: "consume",
            render: (dlgHtml) => { dlgHtml.addClass("survival-needs-consumption-details-dialog");}
        }).render(true);
    }
   async _consumeOneUseOrQuantity(actor, item, itemHasUsesFlag, logPrefixForContext) { // Renamed itemHasUses to itemHasUsesFlag
        const uses = item.system.uses;
        const itemName = item.name;
        const itemID = item.id;
        const warningStyle = "color:orange; font-weight:bold;";
        const detailStyle = "color: olive;";

        // console.log(`${logPrefixForContext} Attempting to consume from '${itemName}'. itemHasUsesFlag: ${itemHasUsesFlag}. Uses obj:`, detailStyle, uses, `Quantity: ${item.system.quantity}`);

        if (itemHasUsesFlag && uses && typeof uses.value === 'number' && uses.max != null) { // Check uses.max for validity too
            if (uses.value > 0) {
                const newValue = uses.value - 1;
                await item.update({ "system.uses.value": newValue });
                const updatedItem = actor.items.get(itemID); // Re-fetch for accurate data after update
                if (updatedItem && (updatedItem.system.uses?.value ?? 0) <= 0 && updatedItem.system.autoDestroy) { 
                    await updatedItem.delete();
                    ui.notifications.info(game.i18n.format("SURVIVAL_NEEDS.notifications.itemEmptyAndDestroyed", {itemName: itemName}));
                } else if (updatedItem && (updatedItem.system.uses?.value ?? 0) <= 0) {
                    ui.notifications.info(game.i18n.format("SURVIVAL_NEEDS.notifications.itemEmpty", {itemName: itemName}));
                }
                return true;
            } else {
                console.warn(`${logPrefixForContext} Item '${itemName}' already has 0 uses. Cannot consume.`, warningStyle);
                ui.notifications.warn(game.i18n.format("SURVIVAL_NEEDS.notifications.itemAlreadyEmpty", {itemName: itemName}));
                return false;
            }
        } else if (item.type === "consumable" && !itemHasUsesFlag) { 
            const qty = item.system.quantity ?? 1;
            if (qty > 0) { // Only consume if quantity > 0
                if (qty > 1) { await item.update({"system.quantity": qty - 1}); } 
                else { await item.delete(); ui.notifications.info(game.i18n.format("SURVIVAL_NEEDS.notifications.itemConsumed", {itemName: itemName}));}
                return true;
            } else {
                 console.warn(`${logPrefixForContext} Consumable '${itemName}' has 0 quantity. Cannot consume.`, warningStyle);
                 ui.notifications.warn(game.i18n.format("SURVIVAL_NEEDS.notifications.itemAlreadyEmpty", {itemName: itemName}));
                 return false;
            }
        } else if (!itemHasUsesFlag && item.type !== "consumable") { 
             console.log(`${logPrefixForContext} Item '${itemName}' (type: ${item.type}) not uses-based or standard consumable. Conceptual use.`, detailStyle);
             return true; 
        }
        
        console.warn(`${logPrefixForContext} Could not determine consumption method for '${itemName}'. Type: ${item.type}, itemHasUsesFlag: ${itemHasUsesFlag}`, warningStyle);
        return false;
    }

    /**
     * Handles clicks on special action buttons defined in tracker configurations.
     */
    async _handleSpecialAction(actor, trackerConfig, actionConfig) {
        const logPrefix = `%c[${MODULE_ID} | SheetIntegration | ${actor.name} | SpecialAction]`;
        const detailStyle = "color: olive;";
        const warningStyle = "color:orange; font-weight:bold;";

        console.log(`${logPrefix} Clicked: Tracker '${trackerConfig.id}', Action '${actionConfig.actionId}'`, detailStyle, actionConfig);

        if (actionConfig.opensChoicesDialog && actionConfig.choices?.length > 0) {
            // This will handle Boredom, Stress, and now Sleep options
            this._showChoiceDialog(actor, trackerConfig, actionConfig);
        } else if (actionConfig.actionId === "relieve_piss" || actionConfig.actionId === "relieve_poop") {
            await this.needsManager.relieveWaste(actor, trackerConfig.id, actionConfig);
        } else if (actionConfig.actionId === "dry_off") {
            await this.needsManager.dryOff(actor, actionConfig);
        } else {
            console.warn(`${logPrefix} Unhandled special action ID without choices dialog: ${actionConfig.actionId} for tracker ${trackerConfig.id}`, warningStyle);
            ui.notifications.warn(`Action "${actionConfig.label}" for ${trackerConfig.name} is not yet fully implemented or misconfigured.`);
        }
    }

    /**
     * Shows a dialog for actions that require a choice (e.g., Boredom, Stress, Sleep options).
     */
    async _showChoiceDialog(actor, trackerConfig, actionConfig) {
        const logPrefix = `%c[${MODULE_ID} | SheetIntegration | ${actor.name} | ChoiceDialog]`;
        const detailStyle = "color: olive;";
        const warningStyle = "color:orange; font-weight:bold;";

        let dialogOptionsHtml = "";
        actionConfig.choices.forEach((choice, index) => {
            let effectDescription = "";
            if (choice.reducesBy !== undefined) {
                effectDescription = game.i18n.format("SURVIVAL_NEEDS.dialogs.choiceEffectFormat", {reducesBy: choice.reducesBy, timeMinutes: choice.timeMinutes});
            } else if (choice.triggersLongRest) {
                effectDescription = game.i18n.format("SURVIVAL_NEEDS.dialogs.choiceTriggersLongRest", {timeMinutes: choice.timeMinutes});
            } else {
                effectDescription = `(Takes ${choice.timeMinutes} min)`;
            }

            dialogOptionsHtml += `
                <div class="form-group">
                    <label for="survivalChoice-${trackerConfig.id}-${choice.id}" class="radio-label">
                        <input type="radio" name="survivalChoice" id="survivalChoice-${trackerConfig.id}-${choice.id}" value="${choice.id}" ${index === 0 ? 'checked' : ''}>
                        ${choice.label} 
                        <small>${effectDescription}</small>
                    </label>
                </div>`;
        });

        if (!dialogOptionsHtml) {
            ui.notifications.warn(game.i18n.format("SURVIVAL_NEEDS.notifications.noChoicesAvailable", {actionLabel: actionConfig.label}));
            return;
        }

        const dialogPrompt = game.i18n.format("SURVIVAL_NEEDS.dialogs.selectActivityPrompt", {actionLabel: actionConfig.label.toLowerCase(), trackerName: trackerConfig.name});

        const dialogContent = `
            <form>
                <p>${dialogPrompt}</p>
                <div class="choices-list">${dialogOptionsHtml}</div>
            </form>`;

        new Dialog({
            title: `${actionConfig.label} - ${trackerConfig.name}`,
            content: dialogContent,
            buttons: {
                select: {
                    icon: '<i class="fas fa-check-circle"></i>',
                    label: game.i18n.localize("SURVIVAL_NEEDS.buttons.performActivity"),
                    callback: async (html) => {
                        const selectedChoiceId = html.find('input[name="survivalChoice"]:checked').val();
                        if (selectedChoiceId) {
                            const choiceConfig = actionConfig.choices.find(c => c.id === selectedChoiceId);
                            if (choiceConfig) {
                                console.log(`${logPrefix} Choice selected: '${choiceConfig.label}' for tracker '${trackerConfig.id}'`, detailStyle, choiceConfig);
                                
                                // Route to the correct NeedsManager method based on tracker or choice type
                                if (trackerConfig.id === "sleep") {
                                    await this.needsManager.handleRestChoice(actor, trackerConfig.id, choiceConfig);
                                } else if (trackerConfig.id === "boredom" || trackerConfig.id === "stress") {
                                    await this.needsManager.relieveBoredomOrStress(actor, trackerConfig.id, choiceConfig);
                                } else {
                                    console.warn(`${logPrefix} Choice dialog was used for an unhandled tracker type: ${trackerConfig.id}`, warningStyle);
                                }
                            } else {
                                 console.warn(`${logPrefix} Selected choice ID '${selectedChoiceId}' not found in config.`, warningStyle);
                            }
                        } else {
                             console.warn(`${logPrefix} No choice selected in dialog.`, warningStyle);
                        }
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times-circle"></i>',
                    label: game.i18n.localize("Cancel")
                }
            },
            default: "select",
            render: (dlgHtml) => { 
                dlgHtml.addClass("survival-needs-choice-dialog");
            }
        }).render(true);
    }
}