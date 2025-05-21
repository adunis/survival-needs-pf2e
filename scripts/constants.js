// File: scripts/constants.js
export const MODULE_ID = "survival-needs-pf2e";


// --- SETTING KEYS ---
export const SETTINGS = {
    MODULE_ID : "survival-needs-pf2e",
    UPDATE_INTERVAL_HOURS: "updateIntervalHours",
    AFFECTS_NPCS: "affectsNPCs",
    TRACKER_CONFIGS: "trackerConfigs", // For the array of trackers
    CONSUMPTION_CALC_SETTINGS: "consumptionCalculationSettings" // NEW key for specific constants
};

// --- FLAGS ---
// ... (flags remain the same) ...
export const FLAG_PREFIX = `flags.${MODULE_ID}`;
export const LAST_UPDATE_TIME_FLAG_KEY = "lastUpdateTime";
export const DYNAMIC_EFFECT_FLAG_MODULE_MANAGED = "isSurvivalNeedEffect";
export const DYNAMIC_EFFECT_FLAG_SOURCE_TRACKER_ID = "sourceTrackerId";
export const DYNAMIC_EFFECT_FLAG_THRESHOLD_NAME = "thresholdName";


const ICON_PATH_PREFIX = `modules/${MODULE_ID}/icons/`;

// --- DEFAULT VALUES FOR THE NEW CONSUMPTION CALCULATION SETTINGS ---
export const DEFAULT_CONSUMPTION_CALC_SETTINGS = {
    STANDARD_FOOD_USE_EFFECTIVE_BULK: 0.02,
    STANDARD_DRINK_USE_EFFECTIVE_BULK: 0.02,
    // Modifiers for caloric types (relative to base restore from item)
    CALORIC_MODIFIERS: {
        low: 0.5,
        medium: 1.0,
        high: 1.5
    },
    // Modifiers for drink caloric content (relative to base food restore)
    DRINK_CALORIC_MODIFIERS: {
        none: 0,
        slight: 0.25,
        high: 0.75
    },
    // Boredom/Stress modifiers
    TASTE_BOREDOM: {
        boring: 20,      // Increases boredom
        average: 0,
        interesting: -30 // Decreases boredom
    },
    DRINK_QUALITY_STRESS: {
        dirty: 25,       // Increases stress
        average: 0,
        purified: -15    // Decreases stress
    },
    ALCOHOLIC_EFFECTS: {
        stress: 10,      // Increases stress
        boredom: -40     // Decreases boredom
    },
    POTION_EFFECTS: {
        stress: 15,      // Increases stress
        boredom: -10     // Decreases boredom
    },
    THIRST_TO_PISS_MULTIPLIER: 2.0,
    HUNGER_TO_POOP_MULTIPLIER: 6.0
};


// --- DEFAULT TRACKER CONFIGURATIONS (remains an array) ---
export const DEFAULT_TRACKER_CONFIGS = [
    {
        id: "hunger",
        name: "Hunger",
        enabled: true,
        iconClass: "fas fa-drumstick-bite",
        iconColor: "green",
        defaultValue: 0,
        maxValue: 100,
        increasePerInterval: 0.555, // For 100pts/30days @ 6 (4hr) intervals/day
        thresholdEffects: [
            {
                threshold: 40, name: "Peckish", icon: `${ICON_PATH_PREFIX}Status_Hunger.png`,
                symptoms: [{ slug: "fatigued", value: null }]
            },
            {
                threshold: 70, name: "Famished", icon: `${ICON_PATH_PREFIX}Status_Hunger.png`,
                symptoms: [{ slug: "enfeebled", value: 1 }] // Changed from clumsy for more impact
            },
            {
                threshold: 90, // Lowered for earlier onset of severe
                name: "Starving", icon: `${ICON_PATH_PREFIX}Status_InjuredMinor.png`, // More severe icon
                symptoms: [
                    { slug: "drained", value: 2 },
                    { slug: "enfeebled", value: 2 }, // Added enfeebled
                    { slug: "fatigued", value: null }  // Ensure fatigued persists or reapplies
                ]
            }
        ],
        regeneration: {
            byLongRest: false, longRestAmount: 0, byItem: true,
            itemFilter: {
                types: ["consumable", "equipment"],
                nameKeywords: [
                    "food", "ration", "meal", "jerky", "biscuit", "bread", "cheese", "meat", "stew", "fruit", "vegetable", "berries", "nuts", "pemmican", "travel", "iron",
                    "cake", "pie", "pastry", "soup", "porridge", "gruel", "fish", "poultry", "egg", "grain", "honey", "candy", "chocolate", "dried", "smoked", "pickled", "preserved",
                    "root", "tuber", "fungus", "mushroom", "sausage", "bacon", "ham", "pottage", "hardtack", "waybread", "manna", "ambrosia", "grub", "insect", "larva", "sustenance",
                    "trail mix", "apple", "banana", "orange", "carrot", "potato", "turnip", "feast", "snack", "nourishment", "goulash", "broth" // broth can be food too
                ]
            },
            itemRestoreAmount: 3.33,
            itemButtonLabel: "Eat Food", itemButtonIcon: "fas fa-utensils",
        },
    },
    // --- THIRST ---
    {
        id: "thirst",
        name: "Thirst",
        enabled: true,
        iconClass: "fas fa-tint",
        iconColor: "#DAA520",
        defaultValue: 0,
        maxValue: 100,
        increasePerInterval: 3.33, // For 100pts/5days @ 6 (4hr) intervals/day
        thresholdEffects: [
            {
                threshold: 35, name: "Thirsty", icon: `${ICON_PATH_PREFIX}Status_Thirst.png`,
                symptoms: [ { slug: "fatigued", value: null } ]
            },
            {
                threshold: 70, name: "Parched", icon: `${ICON_PATH_PREFIX}Status_Thirst.png`,
                symptoms: [ { slug: "enfeebled", value: 1 }, {slug: "fatigued", value: null} ] // Fatigued if very parched
            },
            {
                threshold: 90, // Lowered for earlier onset of severe
                name: "Dehydrated", icon: `${ICON_PATH_PREFIX}Status_DifficultyBreathing.png`, // More severe icon
                symptoms: [
                    { slug: "enfeebled", value: 2 },
                    { slug: "drained", value: 2 }, // Increased drained
                    { slug: "stupefied", value: 1 } // Added stupefied
                ]
            }
        ],
        regeneration: {
            byLongRest: false, longRestAmount: 0, byItem: true,
            itemFilter: {
                types: ["consumable", "equipment"],
                nameKeywords: [
                    "water", "drink", "waterskin", "canteen", "flask", "ale", "beer", "wine", "mead", "juice", "tea", "broth", "potion", // Potions often liquid
                    "milk", "cider", "spirit", "liquor", "brandy", "whiskey", "rum", "gin", "vodka", "sake", "nectar", "elixir", "slurp", "coffee", "kava", "hydromel",
                    "grog", "refreshment", "beverage", "draught", "sap", "syrup", "soda", "brew", "cordial", "tonic", "spring", "well", "river", "hydration", "dew"
                ]
            },
            itemRestoreAmount: 20,
            itemButtonLabel: "Drink", itemButtonIcon: "fas fa-glass-whiskey",
        },
    },
    // --- SLEEP DEPRIVATION ---
    {
        id: "sleep",
        name: "Sleep Deprivation",
        enabled: true,
        iconClass: "fas fa-bed",
        iconColor: "dodgerblue",
        defaultValue: 0,
        maxValue: 100,
        increasePerInterval: 10,
        thresholdEffects: [
            {
                threshold: 30, name: "Tired", icon: `${ICON_PATH_PREFIX}Mood_Sleepy.png`,
                symptoms: [ { slug: "fatigued", value: null } ]
            },
            {
                threshold: 60, name: "Weary", icon: `${ICON_PATH_PREFIX}Mood_Sleepy.png`,
                symptoms: [ { slug: "slowed", value: 1 }, {slug: "stupefied", value: 1} ] // Added stupefied
            },
            {
                threshold: 85, // Lowered for earlier onset of severe
                name: "Exhausted", icon: `${ICON_PATH_PREFIX}Mood_Ill.png`, // More severe icon
                symptoms: [
                    { slug: "stupefied", value: 2 },
                    { slug: "slowed", value: 1 }, // Ensure slowed persists
                    { slug: "drained", value: 1 }  // Added drained
                ]
            }
        ],
        regeneration: { byLongRest: true, longRestAmount: 80, byItem: false, },
        specialActions: [ /* ... single button with choices as before ... */
            {
                actionId: "manage_sleep", label: "Rest Options", icon: "fas fa-moon", opensChoicesDialog: true,
                choices: [
                    { id: "short_nap", label: "Short Nap (30 min)", timeMinutes: 30, reducesBy: 15, chatMessage: "{actorName} takes a short, refreshing nap." },
                    { id: "moderate_sleep", label: "Sleep (4 hours)", timeMinutes: 240, reducesBy: 40, chatMessage: "{actorName} gets a few hours of solid sleep." },
                    { id: "full_long_rest", label: "Full Night's Rest (8+ hours)", timeMinutes: 480, triggersLongRest: true, chatMessage: "{actorName} settles in for a full night's rest." }
                ]
            }
        ]
    },
    // --- PISS (BLADDER) ---
    {
        id: "piss", name: "Bladder", enabled: true, iconClass: "fas fa-water", iconColor: "gold",
        defaultValue: 0, maxValue: 100, increasePerInterval: 0,
        thresholdEffects: [
            { threshold: 60, name: "Need to Urinate", icon: `${ICON_PATH_PREFIX}Mood_Discomfort.png`, symptoms: [/* e.g., minor penalty to concentration checks via custom effect */] },
            { threshold: 90, name: "Urgent Bladder", icon: `${ICON_PATH_PREFIX}Mood_Panicked.png`, symptoms: [{ slug: "clumsy", value: 1, note: "Distracted and rushing" }, {slug: "fatigued", value: null}] }
        ],
        regeneration: { byLongRest: false, byItem: false },
        specialActions: [ { actionId: "relieve_piss", label: "Urinate", icon: "fas fa-toilet-paper", timeMinutes: 2, reducesTo: 0, chatMessage: "{actorName} finds a moment to relieve their bladder." }]
    },
    // --- POOP (BOWELS) ---
    {
        id: "poop", name: "Bowels", enabled: true, iconClass: "fas fa-poo", iconColor: "saddlebrown",
        defaultValue: 0, maxValue: 100, increasePerInterval: 0,
        thresholdEffects: [
            { threshold: 70, name: "Need to Defecate", icon: `${ICON_PATH_PREFIX}Mood_Discomfort.png`, symptoms: [{ slug: "slowed", value: 1, note: "Stomach discomfort" }] },
            { threshold: 95, name: "Bowel Emergency", icon: `${ICON_PATH_PREFIX}Mood_Panicked.png`, symptoms: [{ slug: "enfeebled", value: 2, note: "Severe discomfort and cramps" }, {slug:"sickened", value:1}] } // Increased enfeebled, added sickened
        ],
        regeneration: { byLongRest: false, byItem: false },
        specialActions: [ { actionId: "relieve_poop", label: "Defecate", icon: "fas fa-toilet-paper", timeMinutes: 10, reducesTo: 0, chatMessage: "{actorName} takes time for a bowel movement." } ]
    },
    // --- BOREDOM ---
    {
        id: "boredom", name: "Boredom", enabled: true, iconClass: "fas fa-hourglass-end", iconColor: "slategray",
        defaultValue: 0, maxValue: 100, increasePerInterval: 2, // Slightly reduced passive increase
        thresholdEffects: [
            { threshold: 40, name: "Restless", icon: `${ICON_PATH_PREFIX}Mood_Bored.png`, symptoms: [/* Minor penalty to perception or initiative */] },
            { threshold: 70, name: "Bored", icon: `${ICON_PATH_PREFIX}Mood_Bored.png`, symptoms: [{ slug: "stupefied", value: 1, note: "Mind wandering, easily distracted" }] },
            { threshold: 95, name: "Profoundly Bored", icon: `${ICON_PATH_PREFIX}Mood_Sad.png`, symptoms: [{ slug: "stupefied", value: 2, note: "Apathetic, difficult to motivate" }, {slug:"fascinated", value: null, note: "Will latch onto ANYTHING remotely novel, possibly to their detriment."}]} // Fascinated with trivial things
        ],
        regeneration: { byLongRest: false, byItem: false },
        specialActions: [
            {
                actionId: "relieve_boredom", label: "Alleviate Boredom", icon: "fas fa-dice", opensChoicesDialog: true,
                choices: [
                    // Constructive/Neutral
                    { id: "read", label: "Read a Book", timeMinutes: 60, reducesBy: 40, stressChange: -5, chatMessage: "{actorName} gets lost in a good book." },
                    { id: "write_journal", label: "Write (Journal, Story, Song)", timeMinutes: 45, reducesBy: 30, stressChange: -5, chatMessage: "{actorName} puts quill to parchment, expressing their thoughts or creativity." },
                    { id: "practice_skill", label: "Practice a Skill/Craft", timeMinutes: 60, reducesBy: 35, stressChange: 0, chatMessage: "{actorName} hones their abilities." },
                    { id: "whittle_carve", label: "Whittle/Carve Wood", timeMinutes: 30, reducesBy: 20, stressChange: -2, chatMessage: "{actorName} idly whittles a piece of wood, creating small trinkets." },
                    { id: "play_game", label: "Play a Game (Cards, Dice)", timeMinutes: 30, reducesBy: 25, stressChange: -10, chatMessage: "{actorName} enjoys a lighthearted game." },
                    { id: "socialize_pleasantly", label: "Pleasant Socializing", timeMinutes: 30, reducesBy: 30, stressChange: -15, chatMessage: "{actorName} enjoys some friendly conversation." },
                    { id: "tell_story", label: "Tell or Listen to a Story", timeMinutes: 20, reducesBy: 25, stressChange: -10, chatMessage: "{actorName} shares or listens to an engaging tale." },
                    { id: "observe_nature", label: "Observe Nature/People Watch", timeMinutes: 20, reducesBy: 15, stressChange: -5, chatMessage: "{actorName} finds interest in their surroundings." },
                    { id: "tinker", label: "Tinker/Fiddle with Something", timeMinutes: 30, reducesBy: 20, stressChange: 0, chatMessage: "{actorName} tinkers with an object." },
                    { id: "light_exercise_stretch", label: "Light Exercise/Stretching", timeMinutes: 15, reducesBy: 15, stressChange: -5, chatMessage: "{actorName} stretches and moves around, feeling a bit more alert." },
                    { id: "plan_daydream", label: "Plan/Daydream Productively", timeMinutes: 20, reducesBy: 10, stressChange: 0, chatMessage: "{actorName} spends some time planning or letting their mind wander constructively." },
                    { id: "sing_hum", label: "Sing or Hum a Tune", timeMinutes: 10, reducesBy: 10, stressChange: -5, chatMessage: "{actorName} quietly sings or hums, lifting their spirits slightly." },

                    // Potentially Risky / Mischievous
                    { id: "prank_light", label: "Play a Light Prank (PC/Friendly NPC)", timeMinutes: 10, reducesBy: 30, stressChange: 5, chatMessage: "{actorName} plays a harmless prank, feeling a bit livelier." },
                    { id: "gamble_small", label: "Gamble (Small Stakes)", timeMinutes: 60, reducesBy: 25, stressChange: 10, chatMessage: "{actorName} tries their luck with a small gamble." },
                    { id: "spread_rumor", label: "Spread a Minor (Juicy) Rumor", timeMinutes: 15, reducesBy: 35, stressChange: 5, chatMessage: "{actorName} whispers a tantalizing rumor, a spark of excitement in their eyes." },
                    { id: "explore_curiosity", label: "Investigate Something Curious", timeMinutes: 30, reducesBy: 30, stressChange: 5, chatMessage: "{actorName} follows a curious lead, seeking novelty." },
                    { id: "daredevil_minor", label: "Attempt a Minor Daredevil Stunt", timeMinutes: 5, reducesBy: 20, stressChange: 10, chatMessage: "{actorName} attempts a minor stunt for a quick thrill." },

                    // Negative / Troublemaking
                    { id: "annoy_someone", label: "Annoy Someone (PC/NPC)", timeMinutes: 5, reducesBy: 20, stressChange: 15, chatMessage: "{actorName} intentionally annoys someone, finding it amusing." },
                    { id: "vandalize_minor", label: "Minor Vandalism/Mischief", timeMinutes: 10, reducesBy: 40, stressChange: 20, chatMessage: "{actorName} causes some minor, troublesome mischief." },
                    { id: "start_argument", label: "Start a Pointless Argument", timeMinutes: 15, reducesBy: 25, stressChange: 25, chatMessage: "{actorName} picks a fight over something trivial, just for the engagement." },
                    { id: "boast_loudly", label: "Boast Loudly and Excessively", timeMinutes: 10, reducesBy: 15, stressChange: 10, chatMessage: "{actorName} loudly recounts their (possibly exaggerated) exploits." }
                ]
            }
        ]
    },
    // --- STRESS ---
    {
        id: "stress", name: "Stress", enabled: true, iconClass: "fas fa-bolt", iconColor: "orangered",
        defaultValue: 0, maxValue: 100, increasePerInterval: 0, // Primarily event-driven
        thresholdEffects: [
            { threshold: 40, name: "Anxious", icon: `${ICON_PATH_PREFIX}Mood_Stressed.png`, symptoms: [/* Minor penalty to concentration or social checks */] },
            { threshold: 70, name: "Stressed", icon: `${ICON_PATH_PREFIX}Mood_Stressed.png`, symptoms: [{ slug: "frightened", value: 1, note: "On edge, jumpy" }]},
            { threshold: 95, name: "Overwhelmed", icon: `${ICON_PATH_PREFIX}Mood_Panicked.png`, symptoms: [{ slug: "stupefied", value: 2 }, { slug: "frightened", value: 2, note: "Panicked and mentally scattered" }, {slug: "confused", value: null, note: "Cannot think straight"}]} // Added Confused
        ],
        regeneration: { byLongRest: true, longRestAmount: 50, byItem: false },
        specialActions: [
            {
                actionId: "relieve_stress", label: "Alleviate Stress", icon: "fas fa-peace", opensChoicesDialog: true,
                choices: [
                    // Positive / Healthy
                    { id: "meditate", label: "Meditate / Deep Breathing", timeMinutes: 20, reducesBy: 30, boredomChange: 5, chatMessage: "{actorName} finds a moment of calm through meditation." },
                    { id: "talk_it_out", label: "Talk with a Confidante", timeMinutes: 30, reducesBy: 40, boredomChange: -5, chatMessage: "{actorName} shares their burdens with a friend." },
                    { id: "hobby_relaxing", label: "Engage in a Relaxing Hobby", timeMinutes: 60, reducesBy: 50, boredomChange: -20, chatMessage: "{actorName} loses themself in a relaxing hobby." },
                    { id: "take_walk", label: "Take a Quiet Walk", timeMinutes: 30, reducesBy: 20, boredomChange: 0, chatMessage: "{actorName} clears their head with a quiet walk." },
                    { id: "listen_calm_music", label: "Listen to Calming Music/Sounds", timeMinutes: 20, reducesBy: 25, boredomChange: 2, chatMessage: "{actorName} listens to soothing music or natural sounds." },
                    { id: "gentle_stretch_yoga", label: "Gentle Stretching/Yoga", timeMinutes: 15, reducesBy: 20, boredomChange: 3, chatMessage: "{actorName} performs some gentle stretches to release tension." },
                    { id: "pet_animal", label: "Spend Time with an Animal", timeMinutes: 15, reducesBy: 25, boredomChange: -5, chatMessage: "{actorName} finds comfort in the presence of an animal." },
                    { id: "hot_bath_cleanse", label: "Warm Bath/Cleanse (if possible)", timeMinutes: 30, reducesBy: 30, boredomChange: 5, chatMessage: "{actorName} takes a moment for a refreshing cleanse." },
                    { id: "seek_humor", label: "Seek Humor/Laughter", timeMinutes: 10, reducesBy: 20, boredomChange: -10, chatMessage: "{actorName} finds something amusing to lighten their mood." },
                    { id: "gratitude_journal", label: "Reflect on Positives/Gratitude", timeMinutes: 10, reducesBy: 15, boredomChange: 2, chatMessage: "{actorName} takes a moment to reflect on things they are grateful for." },

                    // Neutral / Distraction
                    { id: "vigorous_exercise", label: "Vigorous Exercise", timeMinutes: 30, reducesBy: 35, boredomChange: 10, chatMessage: "{actorName} burns off stress with intense exercise." },
                    { id: "comfort_eat", label: "Comfort Eating (Minor)", timeMinutes: 10, reducesBy: 15, boredomChange: -5, chatMessage: "{actorName} indulges in a small comfort food." }, // Could link to hunger
                    { id: "focus_mundane_task", label: "Focus on a Mundane Task", timeMinutes: 20, reducesBy: 10, boredomChange: 15, chatMessage: "{actorName} focuses on a simple, repetitive task to clear their mind." },

                    // Risky / Negative Coping
                    { id: "drink_heavily", label: "Drink Heavily (Alcohol)", timeMinutes: 60, reducesBy: 50, boredomChange: -30, chatMessage: "{actorName} tries to drink their stress away. (Thirst satisfied, Piss increases, other effects may apply)" }, // This choice would need special handling
                    { id: "lash_out", label: "Lash Out Verbally (NPC/PC)", timeMinutes: 5, reducesBy: 20, boredomChange: -10, chatMessage: "{actorName} vents their frustration by lashing out." }, // Social consequences likely
                    { id: "reckless_act", label: "Minor Reckless Act", timeMinutes: 10, reducesBy: 30, boredomChange: -20, chatMessage: "{actorName} does something a bit reckless to feel alive." }, // Potential for trouble
                    { id: "isolate", label: "Isolate Self", timeMinutes: 60, reducesBy: 10, boredomChange: 20, chatMessage: "{actorName} withdraws, seeking solitude but finding little relief." },
                    { id: "substance_use_other", label: "Use 'Relaxing' Substance (Non-Alcohol)", timeMinutes: 30, reducesBy: 25, boredomChange: -10, chatMessage: "{actorName} uses a substance hoping to calm their nerves, with uncertain side-effects." },
                    { id: "blame_others", label: "Blame Others Unfairly", timeMinutes: 5, reducesBy: 10, boredomChange: -5, chatMessage: "{actorName} unfairly blames others for their stress, feeling a fleeting sense of justification." }
                ]
            }
        ]
    },
    {
        id: "divineFavor",
        name: "Divine Favor",
        enabled: true,
        displayOnSheet: true,
        iconClass: "fas fa-hands-helping",
        iconColor: "gold",
        defaultValue: 0,
        defaultMaxValue: 3,
        isDynamicMax: true,
        shrinesPerExtraPoint: 1,     // Each shrine adds 1 to max divine favor points
        followersPerMaxPoint: 10000, // Each 10k followers adds 1 to max divine favor points

        // NEW: Base increase that happens regardless of shrines, per game time interval.
        // Set to 0 if you only want shrine-based gain.
        baseIncreasePerInterval: 0.0297, // Example: for approx +1 per week if interval is 4 hours (0.0297 * (24/4)*7 ≈ 1.24)

        // MODIFIED: This is now ADDITIONAL increase PER SHRINE, PER GAME TIME INTERVAL
        increasePerShrinePerInterval: 0.01, // Example: each shrine adds this much more per interval

        subProperties: [
            { id: "shrines", label: "Shrines", defaultValue: 0, type: "number", iconClass: "fas fa-place-of-worship", iconColor: "#7851a9" },
            { id: "followers", label: "Followers", defaultValue: 0, type: "number", iconClass: "fas fa-users", iconColor: "#4682b4" }
        ],
        regeneration: { byLongRest: false, byItem: false }, // divineFavor.value not typically regenerated like hunger/thirst
        // specialActions: [ { actionId: "pray_for_favor", label: "Pray for Favor", icon: "fas fa-pray", timeMinutes: 10, reducesBy: -5 (i.e. increases by 5), chatMessage: "{actorName} prays for divine favor." } ]
 },
    // {
    //     id: "misfortune",
    //     name: "Misfortune",
    //     icon: "fas fa-skull-crossbones", // Corrected: icon is a valid property, iconClass is for sheet display
    //     iconClass: "fas fa-skull-crossbones", // Keep for sheet display consistency
    //     iconColor: "black", // Added for sheet display
    //     defaultValue: 0,
    //     maxValue: 100,
    //     // increaseOnHeroPointUse: 10, // This was in your description but not used in main.js hook yet
    //     increaseOnCritSuccess: 10, // This IS used in main.js hook
    //     increasePerInterval: 10, // If your main interval is 4hrs, this means +10 every 4hrs.
    //                              // If you want +1 per minute, and interval is 4hrs (240min), this should be 240.
    //     // intervalMinutes: 10, // This property isn't standardly used by the current NeedsManager time update logic
    //     triggerAtValue: 5,  // <<< CURRENTLY 5. Is this for testing? If so, okay. If not, should be 100.
    //     gmNotificationOnceFlag: true,
    //     displayOnSheet: false,
    //     enabled: false,
    //     thresholdEffects: [], // <<< ADDED THIS - ESSENTIAL FIX
    //     regeneration: { byLongRest: false, byItem: false }, // Added for completeness
    // },
    // {
    //     id: "luck",
    //     name: "Luck",
    //     icon: "fas fa-clover", // Corrected
    //     iconClass: "fas fa-clover", // Keep for sheet
    //     iconColor: "lightgreen", // Added for sheet
    //     defaultValue: 0,
    //     maxValue: 100,
    //     increaseOnFail: 10,
    //     increaseOnCritFail: 50,
    //     triggerAtValue: 100,
    //     resetsOnTrigger: true,
    //     displayOnSheet: false,
    //     enabled: false,
    //     thresholdEffects: [], // <<< ADDED THIS - ESSENTIAL FIX
    //     regeneration: { byLongRest: false, byItem: false }, // Added for completeness
    // },
    // --- WETNESS ---
    {
        id: "wetness", name: "Wetness", enabled: true, iconClass: "fas fa-cloud-rain", iconColor: "deepskyblue",
        defaultValue: 0, maxValue: 100, increasePerInterval: 0,
        thresholdEffects: [
            { threshold: 30, name: "Damp", icon: `${ICON_PATH_PREFIX}Status_Wet.png`, symptoms: [/* If cold, perhaps penalty to Fort vs cold */] },
            { threshold: 70, name: "Soaked", icon: `${ICON_PATH_PREFIX}Status_Wet.png`, symptoms: [{ slug: "clumsy", value: 1, note: "Slippery clothes/gear" }, {slug:"fatigued", value:null, note: "Uncomfortable and chilled"}] },
            { threshold: 95, name: "Freezing Wet", icon: `${ICON_PATH_PREFIX}Status_Windchill.png`, symptoms: [{ slug: "slowed", value: 1 }, {slug: "enfeebled", value: 2, note: "Severely impaired by cold and wetness" }, {slug: "drained", value:1}]} // More severe
        ],
        regeneration: { byLongRest: false, byItem: false },
        specialActions: [
            { actionId: "dry_off", label: "Dry Off", icon: "fas fa-fire", timeMinutes: 30, reducesTo: 0, chatMessage: "{actorName} takes time to dry their clothes and gear." }
        ]
    }
];