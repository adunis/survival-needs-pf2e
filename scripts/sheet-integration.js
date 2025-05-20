// File: scripts/sheet-integration.js

import { MODULE_ID, FLAG_PREFIX } from "./constants.js";

export class SheetIntegration {
    constructor(needsManager) {
        this.needsManager = needsManager;
        const logPrefix = `%c[${MODULE_ID} | SheetIntegration]`;
        const constructorStyle = "color: olive; font-weight:bold;";
        console.log(`${logPrefix} Constructed. Version: SleepChoiceDialog_V1.1`, constructorStyle);
    }

    /**
     * Called when a CharacterSheetPF2e is rendered.
     * Injects the survival needs display into the sheet and binds events.
     */
    async onRenderCharacterSheet(app, html, actorData) { // actorData is often app.actor or data.actor
        const actor = app.actor; 
        const logPrefix = `%c[${MODULE_ID} | SheetIntegration | ${actor?.name || 'UnknownActor'}]`;
        const detailStyle = "color: olive;";
        const warningStyle = "color:orange; font-weight:bold;";

        if (!actor || actor.type !== "character") return; 
        if (!html || html.length === 0) return;

        this.needsManager.loadTrackerConfigs(); 
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

        const templateData = { 
            moduleId: MODULE_ID, 
            actorId: actor.id, 
            trackers: templateTrackers,
        };
        const content = await renderTemplate(`modules/${MODULE_ID}/templates/needs-display.hbs`, templateData);

        if (sheetDisplayElement.length > 0) {
            sheetDisplayElement.replaceWith(content);
        } else {
            let injectionSuccessful = false;
            const targets = [
                'aside > div.sidebar[data-tab="sidebar"] ul.saves', 
                'aside > div.sidebar[data-tab="sidebar"] section.perception', 
                'aside > div.sidebar[data-tab="sidebar"] header:has(h2:contains("Immunities"))',
                'aside > div.sidebar[data-tab="sidebar"]', 
                'form > aside.sidebar', 
                'form aside' 
            ];
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
            if (!injectionSuccessful) {
                console.warn(`${logPrefix} Could not inject needs display.`, warningStyle);
                return;
            }
        }

        const newDisplayElement = html.find(`.survival-needs-display.${MODULE_ID}`);
        this._bindSheetEvents(actor, newDisplayElement, enabledTrackers);
    }

    /**
     * Binds all necessary event listeners to the survival needs display.
     */
    _bindSheetEvents(actor, displayElement, enabledTrackers) {
        const logPrefixBase = `%c[${MODULE_ID} | SheetIntegration | ${actor.name}]`;
        const detailStyle = "color: olive;";
        const warningStyle = "color:orange;";

        // Manual number input changes
        displayElement.find('input[type="number"].tracker-value-input').off('change.survivalNeeds').on('change.survivalNeeds', async event => {
            const input = event.currentTarget;
            const trackerId = $(input).data('trackerId');
            if (!trackerId) {
                console.warn(`${logPrefixBase} Input change: Could not determine trackerId.`, warningStyle, input);
                return;
            }
            const newValue = Number(input.value) || 0;
            // console.log(`${logPrefixBase} Manual input: ${trackerId} -> ${newValue}`, detailStyle);
            await this.needsManager.updateNeedValue(actor, trackerId, newValue);
        });

        // Buttons
        for (const tracker of enabledTrackers) {
            // Item consumption buttons
            if (tracker.regeneration?.byItem) {
                displayElement.find(`.consume-button[data-tracker-id="${tracker.id}"]`).off('click.survivalNeeds').on('click.survivalNeeds', async event => {
                    event.preventDefault();
                    this._handleConsumeItem(actor, tracker);
                });
            }

            // Special action buttons
            if (tracker.specialActions) {
                tracker.specialActions.forEach(actionConfig => {
                    displayElement.find(`.special-action-button[data-tracker-id="${tracker.id}"][data-action-id="${actionConfig.actionId}"]`)
                        .off('click.survivalNeeds').on('click.survivalNeeds', async event => {
                            event.preventDefault();
                            this._handleSpecialAction(actor, tracker, actionConfig);
                        });
                });
            }
        }
    }


async _handleConsumeItem(actor, trackerConfig) {
        const logPrefixFunc = (actorName) => `%c[${MODULE_ID} | SheetIntegration | ${actorName || 'UnknownActor'} | ConsumeItem]`;
        const detailStyle = "color: olive;";
        const warningStyle = "color:orange; font-weight:bold;";
        const errorStyle = "color:red; font-weight:bold;";

        if (!actor || !trackerConfig || !trackerConfig.regeneration?.byItem) {
            console.warn(logPrefixFunc(actor.name) + ` Invalid call to _handleConsumeItem (missing actor, trackerConfig, or not byItem). Aborting.`, warningStyle);
            return;
        }
        console.log(logPrefixFunc(actor.name) + ` Initiating consumption for tracker '${trackerConfig.id}'. Item Filter:`, detailStyle, trackerConfig.regeneration.itemFilter);

        const itemRegenConfig = trackerConfig.regeneration;
        const itemFilter = itemRegenConfig.itemFilter || {};
        
        // Prepare filters
        const filterTypes = (Array.isArray(itemFilter.types) && itemFilter.types.length > 0 
            ? itemFilter.types 
            : ["consumable"] // Default to consumable if no types specified
        ).map(t => t.toLowerCase().trim()).filter(Boolean);

        const nameKeywords = (Array.isArray(itemFilter.nameKeywords) 
            ? itemFilter.nameKeywords 
            : []
        ).map(k => k.toLowerCase().trim()).filter(Boolean);
        
        // Filter suitable items from actor's inventory
        const suitableItems = actor.items.filter(item => {
            if (!filterTypes.includes(item.type.toLowerCase())) return false;
            
            const quantity = item.system.quantity;
            const uses = item.system.uses; // PF2e uses object: { value, max, per }

            // Check usability based on uses or quantity
            let isUsable = true;
            if (uses && typeof uses.value === 'number' && typeof uses.max === 'number') { // Prioritize 'uses' if present
                if (uses.value <= 0) isUsable = false;
            } else if (item.type === "consumable") { // For consumables without a defined 'uses' object, check quantity
                if (quantity == null || quantity <= 0) isUsable = false;
            } else if (item.type !== "consumable") { // For non-consumables (e.g. equipment like a waterskin item)
                // If it has 'uses', it's covered above. If not, only check quantity if it's numeric and zero.
                // Some equipment might not have quantity or uses, implying infinite conceptual uses for its type.
                if (!uses && typeof quantity === 'number' && quantity <= 0) isUsable = false;
            }
            if (!isUsable) return false;
            
            // Check name keywords
            if (nameKeywords.length > 0) {
                if (!nameKeywords.some(keyword => item.name.toLowerCase().includes(keyword))) return false;
            }
            return true;
        });

        console.log(logPrefixFunc(actor.name) + ` Found ${suitableItems.length} suitable items.`, detailStyle, suitableItems.map(i=>i.name));

        if (suitableItems.length === 0) {
            ui.notifications.warn(game.i18n.format(`${MODULE_ID}.notifications.noSuitableItem`, { 
                actorName: actor.name, 
                trackerName: trackerConfig.name 
            }));
            return;
        }

         let optionsHtml = suitableItems.map(item => {
            const uses = item.system.uses;
            const hasDefinedUses = uses && typeof uses.value === 'number' && typeof uses.max === 'number';
            let usesString = hasDefinedUses ? ` (${uses.value}/${uses.max} uses)` : "";
            
            let quantityString = "";
            if (item.type === "consumable" && item.system.quantity != null && !hasDefinedUses) {
                quantityString = ` (x${item.system.quantity})`;
            }

            let itemTotalBulk = 0;
            // More robust bulk checking from PF2e system: item.bulk.value gives total bulk in Bulk units
            if (item.bulk?.value) { // item.bulk is a Bulk object
                itemTotalBulk = item.bulk.value;
            } else if (typeof item.system.bulk?.value === 'number') { // Older path or simple object
                 itemTotalBulk = item.system.bulk.value;
            } else if (item.system.bulk?.light) { // system.bulk = { light: X }
                itemTotalBulk = item.system.bulk.light * 0.1;
            } else if (item.type === "consumable" && !item.system.bulk) { // Consumable with no bulk data
                itemTotalBulk = 0.1; // Default to L
            }


            let effectiveBulkPerUse = itemTotalBulk; 
            if (hasDefinedUses && uses.max > 0) {
                effectiveBulkPerUse = itemTotalBulk / uses.max;
            }
            effectiveBulkPerUse = Math.max(0.01, Number(effectiveBulkPerUse.toFixed(3))); 

            console.log(logPrefixFunc(actor.name) + ` Item: ${item.name}, TotalBulk: ${itemTotalBulk}, HasUses: ${hasDefinedUses}, MaxUses: ${uses?.max}, EffectiveBulkPerUse: ${effectiveBulkPerUse}`);

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
                        // *** CRITICAL: Read effectiveBulkPerUse from the selected option ***
                        const itemEffectiveBulk = parseFloat(selectedOption.data('effective-bulk')); 
                        const itemHasUses = String(selectedOption.data('has-uses')) === 'true';

                        if (!itemId) return;
                        const itemToConsume = actor.items.get(itemId);
                        if (!itemToConsume) { ui.notifications.error(game.i18n.localize(`${MODULE_ID}.notifications.itemNotFound`)); return; }

                        console.log(logPrefixFunc(actor.name) + ` Selected item: ${itemToConsume.name}, Effective Bulk for this use: ${itemEffectiveBulk}, HasUses: ${itemHasUses}`);

                        const itemNameLower = itemToConsume.name.toLowerCase();
                        const itemSlug = itemToConsume.system.slug?.toLowerCase() || ""; // Ensure slug is lowercased for comparison

                        // --- Standard Item Check ---
                        // Using slugs is generally more reliable than names.
                        const standardRationSlugs = ["rations", "ration", "standard-ration"]; // Add known slugs for standard rations
                        const standardWaterskinSlugs = ["waterskin", "standard-waterskin", "canteen"];

                        let isStandardRation = false;
                        if (trackerConfig.id === 'hunger') {
                            isStandardRation = standardRationSlugs.includes(itemSlug) || 
                                               (itemNameLower.includes("ration") && 
                                                !itemNameLower.includes("emergency") && 
                                                !itemNameLower.includes("field") && // common prefix for "field rations"
                                                !itemNameLower.includes("traveler's any-tool"));
                        }

                        let isStandardWaterskin = false;
                        if (trackerConfig.id === 'thirst') {
                            isStandardWaterskin = standardWaterskinSlugs.includes(itemSlug) ||
                                                  itemNameLower.includes("waterskin") || 
                                                  itemNameLower.includes("canteen");
                        }
                        
                        console.log(logPrefixFunc(actor.name) + ` Standard checks - IsRation: ${isStandardRation}, IsWaterskin: ${isStandardWaterskin}`);

                        if (isStandardRation || isStandardWaterskin) {
                            console.log(logPrefixFunc(actor.name) + ` Standard item '${itemToConsume.name}' confirmed. Processing with defaults.`, detailStyle);
                            const consumptionData = {
                                item: itemToConsume, itemIcon: itemToConsume.img, itemName: itemToConsume.name,
                                itemBulk: itemEffectiveBulk, // This IS PER USE if itemHasUses was true
                                originalTrackerId: trackerConfig.id,
                                baseRestoreAmount: itemRegenConfig.itemRestoreAmount,
                                isStandard: true,
                                taste: isStandardRation ? "boring" : undefined,
                                caloricType: isStandardRation ? "medium" : undefined,
                                drinkQuality: isStandardWaterskin ? "average" : undefined,
                                isAlcoholic: false, isPotion: false, drinkCaloric: "none",
                                hasUses: itemHasUses 
                            };
                            
                            let consumptionSuccessful = await this._consumeOneUseOrQuantity(actor, itemToConsume, itemHasUses, logPrefixFunc(actor.name));
                            if (consumptionSuccessful) {
                                await this.needsManager.processDetailedConsumption(actor, consumptionData);
                            } else { ui.notifications.warn(game.i18n.format("SURVIVAL_NEEDS.notifications.couldNotConsumeUse", {itemName: itemToConsume.name})); }
                        } else {
                            console.log(logPrefixFunc(actor.name) + ` Item '${itemToConsume.name}' not standard. Proceeding to details dialog.`, detailStyle);
                            this._showConsumptionDetailsDialog(actor, trackerConfig, itemToConsume, itemEffectiveBulk, itemRegenConfig, itemHasUses);
                        }
                    }
                },
                cancel: { icon: '<i class="fas fa-times-circle"></i>', label: game.i18n.localize("Cancel") }
            },
            default: "next"
        }).render(true);
    }


    async _showConsumptionDetailsDialog(actor, trackerConfig, itemToConsume, itemBulk, itemRegenConfig) {
        const logPrefixFunc = (actorName) => `%c[${MODULE_ID} | SheetIntegration | ${actorName || 'UnknownActor'} | ConsumptionDetails]`;
        const isFood = trackerConfig.id === 'hunger'; // Assuming 'hunger' button means it's food
        const isDrink = trackerConfig.id === 'thirst'; // Assuming 'thirst' button means it's drink

        let detailsFormHtml = `<p>Regarding the <strong>${itemToConsume.name}</strong> (Bulk: ${itemBulk}):</p>`;

        if (isFood) {
            detailsFormHtml += `
                <div class="form-group">
                    <label>${game.i18n.localize("SURVIVAL_NEEDS.dialogs.food.caloricType")}:</label>
                    <select name="caloricType">
                        <option value="low">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.lowCaloric")}</option>
                        <option value="medium" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.food.mediumCaloric")}</option>
                        <option value="high">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.highCaloric")}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("SURVIVAL_NEEDS.dialogs.food.taste")}:</label>
                    <select name="taste">
                        <option value="boring">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.boring")}</option>
                        <option value="average" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.food.average")}</option>
                        <option value="interesting">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.interesting")}</option>
                    </select>
                </div>`;
        } else if (isDrink) {
            detailsFormHtml += `
                <div class="form-group">
                    <label>${game.i18n.localize("SURVIVAL_NEEDS.dialogs.drink.quality")}:</label>
                    <select name="drinkQuality">
                        <option value="dirty">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.dirty")}</option>
                        <option value="average" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.average")}</option>
                        <option value="purified">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.purified")}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" name="isAlcoholic"> ${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.isAlcoholic")}
                    </label>
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" name="isPotion"> ${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.isPotion")}
                    </label>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("SURVIVAL_NEEDS.dialogs.drink.caloricContent")}:</label>
                    <select name="drinkCaloric">
                        <option value="none" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.caloricNone")}</option>
                        <option value="slight">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.caloricSlight")}</option>
                        <option value="high">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.caloricHigh")}</option>
                    </select>
                </div>`;
        }

        const dialogContent = `<form>${detailsFormHtml}</form>`;

        new Dialog({
            title: game.i18n.format("SURVIVAL_NEEDS.dialogs.consumeDetails.title", {itemName: itemToConsume.name}),
            content: dialogContent,
            buttons: {
                consume: {
                    icon: '<i class="fas fa-check-circle"></i>',
                    label: game.i18n.localize(`${MODULE_ID}.dialogs.consumeItem.consumeButton`),
                    callback: async (html) => {
                        const consumptionData = {
                            item: itemToConsume,
                            itemBulk: itemBulk,
                            originalTrackerId: trackerConfig.id, // hunger or thirst
                            baseRestoreAmount: itemRegenConfig.itemRestoreAmount, // Base restore value from config
                        };

                        if (isFood) {
                            consumptionData.caloricType = html.find('select[name="caloricType"]').val();
                            consumptionData.taste = html.find('select[name="taste"]').val();
                        } else if (isDrink) {
                            consumptionData.drinkQuality = html.find('select[name="drinkQuality"]').val();
                            consumptionData.isAlcoholic = html.find('input[name="isAlcoholic"]').is(':checked');
                            consumptionData.isPotion = html.find('input[name="isPotion"]').is(':checked');
                            consumptionData.drinkCaloric = html.find('select[name="drinkCaloric"]').val();
                        }
                        
                        console.log(logPrefixFunc(actor.name) + " Consumption details collected:", "color:olive;", consumptionData);

                        // Actual item consumption (quantity/deletion)
                        let consumptionSuccessful = false;
                        if (typeof itemToConsume.consume === 'function') {
                            try { await itemToConsume.consume(); consumptionSuccessful = true; } 
                            catch (err) { /* ... error handling ... */ }
                        } else if (itemToConsume.type === "consumable") { 
                            const qty = itemToConsume.system.quantity ?? 1;
                            if (qty > 1) { await itemToConsume.update({"system.quantity": qty - 1}); } 
                            else { await itemToConsume.delete(); }
                            consumptionSuccessful = true;
                        } else { await itemToConsume.delete(); consumptionSuccessful = true; }

                        if (consumptionSuccessful) {
                            // Call a new method in NeedsManager to process these detailed effects
                            await this.needsManager.processDetailedConsumption(actor, consumptionData);
                        } else {
                            ui.notifications.error(game.i18n.format("PF2E.ErrorMessage.CouldNotConsume", { item: itemToConsume.name, details: "Failed to update/delete item."}));
                        }
                    }
                },
                cancel: { icon: '<i class="fas fa-times-circle"></i>', label: game.i18n.localize("Cancel") }
            },
            default: "consume",
            render: (dlgHtml) => { dlgHtml.addClass("survival-needs-consumption-details-dialog");}
        }).render(true);
    }

 /**
     * Helper to consume one use or one quantity of an item.
     * @returns {Promise<boolean>} True if consumption was successful or conceptually occurred.
     */
    async _consumeOneUseOrQuantity(actor, item, itemHasUses, logPrefix) {
        const uses = item.system.uses;
        if (itemHasUses && uses && typeof uses.value === 'number' && uses.value > 0) {
            await item.update({ "system.uses.value": uses.value - 1 });
            if ((uses.value - 1) <= 0 && item.system.autoDestroy) { 
                await item.delete();
                ui.notifications.info(`${item.name} is empty and discarded.`);
            } else if ((uses.value - 1) <= 0) {
                 ui.notifications.info(`${item.name} is now empty.`);
            }
            return true;
        } else if (item.type === "consumable" && !itemHasUses) {
            const qty = item.system.quantity ?? 1;
            if (qty > 1) { await item.update({"system.quantity": qty - 1}); } 
            else { await item.delete(); }
            return true;
        } else if (!itemHasUses) { 
             console.log(`${logPrefix} Item ${item.name} has no uses/qty, conceptual use. Item not modified.`, "olive");
             return true; // Conceptual use, no item data change but still "consumed" for effects
        }
        console.warn(`${logPrefix} Could not determine how to consume ${item.name}. No uses and not a standard quantity consumable.`, "orange");
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