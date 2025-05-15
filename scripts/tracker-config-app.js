// In scripts/tracker-config-app.js
import { MODULE_ID, SETTINGS, DEFAULT_TRACKER_CONFIGS } from "./constants.js";
import { getTrackerConfigs } from "./settings.js"; // To load current settings

export class TrackerConfigApp extends FormApplication {
    constructor(object = {}, options = {}) {
        super(object, options);
        // Load current tracker configs when the app is instantiated.
        // Work on a deep copy so changes are not immediately reflected in game.settings
        // until the form is submitted.
        this.trackerConfigs = foundry.utils.duplicate(getTrackerConfigs());
        // console.log("TrackerConfigApp | Constructor | Initial trackerConfigs:", this.trackerConfigs);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: `${MODULE_ID}-tracker-config-app`,
            classes: ["survival-needs-pf2e", "tracker-config-sheet", "sheet"], // Added "sheet" for more generic styling
            title: game.i18n.localize(`${MODULE_ID}.settings.trackerConfigMenu.name`), // "Configure Survival Trackers"
            template: `modules/${MODULE_ID}/templates/tracker-config-app.hbs`,
            width: 800, // Wider for more complex nested forms
            height: "auto", // Let content determine height initially, up to a point
            resizable: true,
            scrollY: [".trackers-list-container"], // Target the main scrollable area
            submitOnChange: false, // User must click "Save"
            closeOnSubmit: false,  // Keep window open after save for further edits
            // Removed tabs for now to simplify; can be re-added if layout becomes too long
        });
    }

    /**
     * Prepare data for the Handlebars template.
     */
    getData(options = {}) {
        const data = super.getData(options);
        data.trackerConfigs = this.trackerConfigs; // Pass the current working copy of configs
        data.moduleId = MODULE_ID; // For flag paths or other module-specific things in template

        // Provide a list of available PF2e condition slugs for dropdowns
        data.availableConditionSlugs = [""] // Add an empty option for "none" or "select"
            .concat(Object.keys(CONFIG.PF2E.conditionTypes).sort());
        
        // console.log("TrackerConfigApp | getData() | trackerConfigs for template:", data.trackerConfigs);
        return data;
    }

    /**
     * Activate listeners for dynamic UI elements (add/remove buttons).
     */
    activateListeners(html) {
        super.activateListeners(html);
        html.find('.add-tracker').on('click', this._onAddTracker.bind(this));
        html.find('.trackers-list-container').on('click', '.remove-tracker', this._onRemoveTracker.bind(this));
        html.find('.trackers-list-container').on('click', '.add-condition', this._onAddCondition.bind(this));
        html.find('.trackers-list-container').on('click', '.remove-condition', this._onRemoveCondition.bind(this));
        
        // Potentially add listeners for color pickers if you implement them
        // html.find('input[type="color"]').on('change', event => this._onChangeColor(event));
    }

    _onAddTracker(event) {
        event.preventDefault();
        const newTracker = {
            id: `custom_${foundry.utils.randomID(6)}`, // Prefix custom IDs
            name: "New Custom Tracker",
            enabled: true,
            iconClass: "fas fa-question-circle",
            iconColor: "#808080",
            defaultValue: 0,
            maxValue: 10,
            increasePerInterval: 0, // Sensible default for custom trackers
            conditions: [],
            regeneration: {
                byLongRest: false,
                longRestAmount: 0,
                byItem: false,
                itemFilter: { types: ["consumable"], nameKeywords: [] },
                itemRestoreAmount: 1,
                itemButtonLabel: "Use Item",
                itemButtonIcon: "fas fa-hand-holding-medical",
            },
        };
        this.trackerConfigs.push(newTracker);
        this.render(true); // Re-render the form to show the new tracker
    }

    _onRemoveTracker(event) {
        event.preventDefault();
        const trackerElement = $(event.currentTarget).closest('.tracker-entry');
        const trackerId = trackerElement.data('trackerId');

        // Prevent removal of default trackers by ID if desired (more robust than just index)
        const defaultTrackerIds = ["hunger", "thirst", "sleep"];
        if (defaultTrackerIds.includes(trackerId)) {
            ui.notifications.warn(`Default tracker "${trackerId}" cannot be removed. You can disable it instead.`);
            return;
        }

        if (trackerId) {
            this.trackerConfigs = this.trackerConfigs.filter(t => t.id !== trackerId);
            this.render(true);
        }
    }

    _onAddCondition(event) {
        event.preventDefault();
        const trackerId = $(event.currentTarget).closest('.tracker-entry').data('trackerId');
        const tracker = this.trackerConfigs.find(t => t.id === trackerId);
        if (tracker) {
            // Ensure conditions array exists
            if (!Array.isArray(tracker.conditions)) {
                tracker.conditions = [];
            }
            tracker.conditions.push({
                threshold: 5,
                slug: "", // Let user select
                value: null, // Default to null for boolean, user can change for valued
                critical: false,
                note: "",
            });
            this.render(true);
        }
    }

    _onRemoveCondition(event) {
        event.preventDefault();
        const conditionElement = $(event.currentTarget).closest('.condition-entry');
        const trackerId = conditionElement.closest('.tracker-entry').data('trackerId');
        // Get index from the element, assuming it's correctly set by Handlebars {{condIndex}}
        const conditionIndex = parseInt(conditionElement.data('conditionIndex')); 

        const tracker = this.trackerConfigs.find(t => t.id === trackerId);
        if (tracker && !isNaN(conditionIndex) && tracker.conditions && tracker.conditions[conditionIndex]) {
            tracker.conditions.splice(conditionIndex, 1);
            this.render(true);
        }
    }

    /**
     * This method is called when the form is submitted.
     * It processes the FormData and saves it to game settings.
     * @param {Event} event The originating form submission event.
     * @param {Object} formData The form data, flattened with dot notation.
     */
    async _updateObject(event, formData) {
        const newConfigs = [];
        // expandObject converts the flat form data (e.g., "trackerConfigs.0.name") 
        // into a nested object structure that mirrors our desired array of objects.
        const expandedData = foundry.utils.expandObject(formData);

        // expandedData.trackerConfigs will be an object where keys are indices "0", "1", "2", etc.
        // We need to convert this into an array.
        const submittedTrackersArray = expandedData.trackerConfigs ? Object.values(expandedData.trackerConfigs) : [];

        for (const submittedTracker of submittedTrackersArray) {
            if (!submittedTracker.id || !submittedTracker.id.trim()) {
                // console.warn(`${MODULE_ID} | Skipping tracker with missing or empty ID in form data.`);
                continue; 
            }

            const tracker = {
                // Basic properties
                id: submittedTracker.id.trim(),
                name: submittedTracker.name?.trim() || "Unnamed Tracker",
                enabled: !!submittedTracker.enabled, // Convert to boolean
                iconClass: submittedTracker.iconClass?.trim() || "fas fa-question-circle",
                iconColor: submittedTracker.iconColor?.trim() || "#808080",
                defaultValue: Number(submittedTracker.defaultValue) || 0,
                maxValue: Number(submittedTracker.maxValue) || 10,
                increasePerInterval: Number(submittedTracker.increasePerInterval) || 0,
                
                // Conditions array
                conditions: [],

                // Regeneration object
                regeneration: {
                    byLongRest: !!submittedTracker.regeneration?.byLongRest,
                    longRestAmount: Number(submittedTracker.regeneration?.longRestAmount) || 0,
                    byItem: !!submittedTracker.regeneration?.byItem,
                    itemFilter: {
                        types: (submittedTracker.regeneration?.itemFilter?.types?.split(',') || ["consumable"])
                                .map(s => s.trim()).filter(Boolean), // Trim and remove empty strings
                        nameKeywords: (submittedTracker.regeneration?.itemFilter?.nameKeywords?.split(',') || [])
                                .map(s => s.trim()).filter(Boolean),
                    },
                    itemRestoreAmount: Number(submittedTracker.regeneration?.itemRestoreAmount) || 1,
                    itemButtonLabel: submittedTracker.regeneration?.itemButtonLabel?.trim() || "Use",
                    itemButtonIcon: submittedTracker.regeneration?.itemButtonIcon?.trim() || "fas fa-hand-holding-medical",
                }
            };

            // Process conditions for this tracker
            if (submittedTracker.conditions && typeof submittedTracker.conditions === 'object') {
                const submittedConditionsArray = Object.values(submittedTracker.conditions);
                for (const submittedCondition of submittedConditionsArray) {
                    if (submittedCondition.slug && submittedCondition.slug.trim() && submittedCondition.threshold !== undefined) {
                        tracker.conditions.push({
                            threshold: Number(submittedCondition.threshold) || 0,
                            slug: submittedCondition.slug.trim(),
                            value: submittedCondition.value === null || submittedCondition.value === "" || isNaN(Number(submittedCondition.value)) ? null : Number(submittedCondition.value), // null for boolean, number otherwise
                            critical: !!submittedCondition.critical,
                            note: submittedCondition.note?.trim() || "",
                        });
                    }
                }
            }
            newConfigs.push(tracker);
        }
        
        this.trackerConfigs = newConfigs; // Update the app's internal state
        
        // Save the processed configurations to game settings
        await game.settings.set(MODULE_ID, SETTINGS.TRACKER_CONFIGS, JSON.stringify(newConfigs, null, 2));
        ui.notifications.info("Survival Tracker configurations saved.");
        
        // The onChange hook on the setting in settings.js will handle reloading in managers.
        this.render(); // Re-render the form, which will use the newly saved (and re-parsed) data
    }
}