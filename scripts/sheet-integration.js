// In scripts/sheet-integration.js
import { MODULE_ID, FLAG_PREFIX } from "./constants.js";
// No need to import getTrackerConfigs here, NeedsManager will provide them or they come from template data

export class SheetIntegration {
    constructor(needsManager) {
        this.needsManager = needsManager; // Injected dependency
        // console.log(`${MODULE_ID} | SheetIntegration: Constructed.`);
    }

    /**
     * Called when a CharacterSheetPF2e is rendered.
     * Injects the survival needs display into the sheet.
     * @param {Application} app The sheet application.
     * @param {jQuery} html The jQuery object representing the sheet's HTML.
     * @param {Object} data The sheet data. Actor is at data.actor or app.actor.
     */
    async onRenderCharacterSheet(app, html, actorData) { // actorData is app.actor from main.js
        const actor = app.actor;
        if (!actor || actor.type !== "character") return; // Only for player characters
        if (!html || html.length === 0) return;

        // Ensure NeedsManager has the latest configs loaded (important if settings changed without a reload)
        this.needsManager.loadTrackerConfigs();
        const enabledTrackers = this.needsManager.trackerConfigs.filter(tc => tc.enabled);

        if (enabledTrackers.length === 0) {
            // If no trackers are enabled, ensure any old display is removed
            html.find(`.survival-needs-display.${MODULE_ID}`).remove();
            return;
        }

        const currentNeeds = this.needsManager.getActorNeeds(actor);

        // Prepare data specifically for the template, including the flag path for direct input binding
        const templateTrackers = enabledTrackers.map(tracker => ({
            ...tracker, // Spread all properties from the tracker config
            currentValue: currentNeeds[tracker.id] ?? tracker.defaultValue ?? 0,
            flagPath: `${FLAG_PREFIX}.${tracker.id}` // e.g., flags.survival-needs-pf2e.hunger
        }));

        const templateData = {
            moduleId: MODULE_ID,
            actorId: actor.id, // For unique IDs in template if needed
            trackers: templateTrackers,
            isGM: game.user.isGM // For potential GM-only controls in template (not currently used)
        };

        const content = await renderTemplate(`modules/${MODULE_ID}/templates/needs-display.hbs`, templateData);
        
        const sheetHtml = $(html); // Ensure html is a jQuery object

        // Remove old display if it exists, to prevent duplication on re-renders
        // Add module ID as a class for more specific targeting
        sheetHtml.find(`.survival-needs-display.${MODULE_ID}`).remove(); 

        // --- Injection Logic (copied from previous successful version) ---
        let injectionSuccessful = false;
        let targetElement = sheetHtml.find('aside > div.sidebar[data-tab="sidebar"] ul.saves');
        if (targetElement.length > 0) {
            targetElement.after(content);
            injectionSuccessful = true;
        }
        if (!injectionSuccessful) {
            targetElement = sheetHtml.find('aside > div.sidebar[data-tab="sidebar"] section.perception');
            if (targetElement.length > 0) {
                targetElement.after(content);
                injectionSuccessful = true;
            }
        }
        if (!injectionSuccessful) {
            targetElement = sheetHtml.find('aside > div.sidebar[data-tab="sidebar"] header:has(h2:contains("Immunities"))');
            if (targetElement.length > 0) {
                targetElement.before(content);
                injectionSuccessful = true;
            }
        }
        if (!injectionSuccessful) {
            targetElement = sheetHtml.find('aside > div.sidebar[data-tab="sidebar"]');
            if (targetElement.length > 0) {
                targetElement.append(content); // Append as a last resort within the main sidebar div
                injectionSuccessful = true;
            }
        }
        if (!injectionSuccessful) {
            targetElement = sheetHtml.find('form > aside, aside.sidebar').first();
            if (targetElement.length > 0) {
                targetElement.append(content);
                injectionSuccessful = true;
            }
        }
        // --- End Injection Logic ---

        if (!injectionSuccessful) {
            console.warn(`${MODULE_ID} | SheetIntegration: Could not find a suitable place in character sheet sidebar for actor ${actor.name}.`);
        } else {
            // Add listeners for dynamic consume buttons after content is injected
            const displayElement = sheetHtml.find(`.survival-needs-display.${MODULE_ID}`);
            if (displayElement.length > 0) {
                for (const tracker of enabledTrackers) {
                    if (tracker.regeneration?.byItem) {
                        displayElement.find(`.consume-button[data-tracker-id="${tracker.id}"]`).on('click', async (event) => {
                            event.preventDefault();
                            this._handleConsumeItem(actor, tracker);
                        });
                    }
                }
            }
        }
    }

    /**
     * Handles the item consumption flow for a given tracker.
     * @param {ActorPF2e} actor The actor consuming the item.
     * @param {Object} trackerConfig The configuration object for the tracker being affected.
     */
    async _handleConsumeItem(actor, trackerConfig) {
        if (!actor || !trackerConfig || !trackerConfig.regeneration?.byItem) return;

        const itemRegenConfig = trackerConfig.regeneration;
        const itemFilter = itemRegenConfig.itemFilter || {};
        const filterTypes = Array.isArray(itemFilter.types) && itemFilter.types.length > 0 ? itemFilter.types : ["consumable"];
        const nameKeywords = (Array.isArray(itemFilter.nameKeywords) ? itemFilter.nameKeywords : []).map(k => k.toLowerCase().trim()).filter(Boolean);
        // Future: const traitKeywords = (Array.isArray(itemFilter.traitKeywords) ? itemFilter.traitKeywords : []).map(k => k.toLowerCase().trim()).filter(Boolean);

        const suitableItems = actor.items.filter(item => {
            if (!filterTypes.includes(item.type)) return false;
            if ((item.system.quantity ?? 0) <= 0) return false; // Must have quantity

            // Name keyword check (if keywords are provided)
            if (nameKeywords.length > 0) {
                const itemNameLower = item.name.toLowerCase();
                if (!nameKeywords.some(keyword => itemNameLower.includes(keyword))) {
                    return false; // Does not match any required name keyword
                }
            }
            // Future: Trait keyword check
            // if (traitKeywords.length > 0) { ... }
            return true;
        });

        if (suitableItems.length === 0) {
            ui.notifications.warn(game.i18n.format(`${MODULE_ID}.notifications.noSuitableItem`, {
                actorName: actor.name,
                trackerName: trackerConfig.name 
            }));
            return;
        }

        let optionsHtml = suitableItems.map(item => 
            `<option value="${item.id}">${item.name} (x${item.system.quantity ?? 1})</option>`
        ).join("");

        const dialogContent = `
            <form>
                <p>${game.i18n.format(`${MODULE_ID}.dialogs.consumeItem.prompt`, { trackerName: trackerConfig.name })}</p>
                <div class="form-group">
                    <label for="${MODULE_ID}-item-select">Select Item:</label>
                    <select name="itemId" id="${MODULE_ID}-item-select" style="width: 100%; margin-top: 5px;">${optionsHtml}</select>
                </div>
            </form>`;

        new Dialog({
            title: itemRegenConfig.itemButtonLabel || game.i18n.format(`${MODULE_ID}.dialogs.consumeItem.title`, { trackerName: trackerConfig.name }),
            content: dialogContent,
            buttons: {
                consume: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize(`${MODULE_ID}.dialogs.consumeItem.consumeButton`), // "Consume"
                    callback: async (html) => {
                        const itemId = html.find('select[name="itemId"]').val();
                        if (!itemId) return;
                        const itemToConsume = actor.items.get(itemId);
                        if (!itemToConsume) {
                            ui.notifications.error(game.i18n.localize(`${MODULE_ID}.notifications.itemNotFound`));
                            return;
                        }

                        const consumedItemName = itemToConsume.name;
                        const consumedItemImg = itemToConsume.img;
                        const consumedItemUuid = itemToConsume.uuid;

                        // Consume the item (reduce quantity or delete)
                        const currentQuantity = itemToConsume.system.quantity ?? 1;
                        if (currentQuantity > 1) {
                            await itemToConsume.update({ "system.quantity": currentQuantity - 1 });
                        } else {
                            await itemToConsume.delete();
                        }
                        
                        const reductionAmount = itemRegenConfig.itemRestoreAmount ?? 1;
                        // Call NeedsManager to update the value, it will handle clamping and condition updates
                        const currentNeedVal = actor.getFlag(MODULE_ID, trackerConfig.id) ?? trackerConfig.defaultValue ?? 0;
                        const newNeedVal = currentNeedVal - reductionAmount; // For "bad" needs. Positive for "good" needs.
                                                                            // The updateNeedValue will clamp it.

                        await this.needsManager.updateNeedValue(actor, trackerConfig.id, newNeedVal);
                        
                        // Create Chat Message
                        const chatMessageContent = await renderTemplate(`modules/${MODULE_ID}/templates/chat-consume.hbs`, {
                            actorName: actor.name,
                            trackerName: trackerConfig.name,
                            buttonLabel: itemRegenConfig.itemButtonLabel,
                            itemName: consumedItemName,
                            itemImg: consumedItemImg,
                            itemUuid: consumedItemUuid,
                            reductionAmount: reductionAmount,
                            // newNeedValue: newNeedVal // The actual new value after clamping is inside updateNeedValue
                                                       // We can get it again if needed, or just state the reduction.
                        });

                        ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({ actor: actor }),
                            content: chatMessageContent,
                        });
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("Cancel")
                }
            },
            default: "consume"
        }).render(true);
    }
}