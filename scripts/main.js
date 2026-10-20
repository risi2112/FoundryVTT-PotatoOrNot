import CONSTANTS from "./constants.js";
import * as lib from "./lib.js";

Hooks.once("init", () => {

    // Register settings during init (rather than ready) so they exist before the
    // Settings Configuration app and other modules try to read them.
    for (const [key, value] of Object.entries(foundry.utils.deepClone(CONSTANTS.SETTINGS))) {
        game.settings.register(CONSTANTS.MODULE_NAME, key, value);
    }

    game.settings.registerMenu(CONSTANTS.MODULE_NAME, CONSTANTS.MODULE_NAME, {
        name: "Set Up Potato Settings",
        label: "Show Dialog",
        icon: "fa-solid fa-potato",
        type: PotatoOrNotApplication,
        restricted: false
    });

    game.settings.registerMenu(CONSTANTS.MODULE_NAME, "player-check", {
        name: "PotatoOrNot.PlayerCheck.MenuName",
        hint: "PotatoOrNot.PlayerCheck.MenuHint",
        label: "PotatoOrNot.PlayerCheck.MenuLabel",
        icon: "fa-solid fa-clipboard-check",
        type: PotatoPlayerCheck,
        restricted: true
    });

});

Hooks.once("ready", () => {

    window.PotatoOrNot = new PotatoOrNotHandler();

    console.log("Potato Or Not | Ready")

    Hooks.call("PotatoOrNotReady");

    setTimeout(() => {
        window.PotatoOrNot.postSetup();
        reportStatus();
    }, 250);

});

class PotatoOrNotHandler {

    constructor() {

        this._settings = foundry.utils.deepClone(CONSTANTS.BASE_SETTINGS);

        this._quality = lib.getSetting(CONSTANTS.SETTING_KEYS.POTATO_LEVEL);

    }

    get current_settings() {
        return this.settings[this.quality];
    }

    set settings(settings) {
        throw new Error("You cannot set settings directly, please use PotatoOrNot.addSetting and PotatoOrNot.removeSetting");
    }

    get settings() {
        return this._settings;
    }

    _validate_quality_level(quality_level) {
        if (this.settings[quality_level] === undefined) throw new Error("quality_level must be 0, 1, or 2 - low, medium, and high settings");
    }

    _validate_module(quality_level, module) {
        this._validate_quality_level(quality_level);
        if (this.settings[quality_level][module] === undefined) throw `Module setting "${module}" not found in quality level of "${quality_level}"`;
    }

    _validate_setting(quality_level, module, setting) {
        this._validate_module(quality_level, module);
        if (this.settings[quality_level][module][setting] === undefined) throw `Setting "${setting}" in module "${module}" not found`;
    }

    get numberOfSettings() {
        let numberOfSettings = [];
        for (let i = 0; i < this.settings.length; i++) {
            numberOfSettings[i] = 0;
            for (let settings of Object.values(this.settings[i])) {
                numberOfSettings[i] += Object.keys(settings).length;
            }
        }
        return numberOfSettings;
    }

    postSetup() {

        let currentNumberOfSettings = this.numberOfSettings[this.quality];

        const hasBeenPrompted = lib.getSetting(CONSTANTS.SETTING_KEYS.HAS_BEEN_PROMPTED);
        const promptUsers = lib.getSetting(CONSTANTS.SETTING_KEYS.PROMPT_USERS);
        const numberOfSettings = lib.getSetting(CONSTANTS.SETTING_KEYS.NUMBER_OF_SETTINGS);

        // The GM can ask everyone to choose again from the Player Check window.
        const promptRound = lib.getSetting(CONSTANTS.SETTING_KEYS.PROMPT_ROUND);
        const askedAgain = !game.user.isGM && promptRound > lib.getSetting(CONSTANTS.SETTING_KEYS.SEEN_PROMPT_ROUND);
        if (askedAgain) lib.setSetting(CONSTANTS.SETTING_KEYS.SEEN_PROMPT_ROUND, promptRound);

        if ((!hasBeenPrompted && promptUsers) || askedAgain) {
            this.showDialog();
        } else if (currentNumberOfSettings !== numberOfSettings) {
            this.updateSettings();
        }
    }

    /**
     * Called on every client when the GM presses "Ask everyone again" while they are connected.
     *
     * @param {number} round   The new prompt round
     */
    onPromptRound(round) {
        if (game.user.isGM) return;
        lib.setSetting(CONSTANTS.SETTING_KEYS.SEEN_PROMPT_ROUND, round);
        this.showDialog();
    }

    async updateSettings() {

        let modules = Object.keys(this.current_settings);

        let currentNumberOfSettings = this.numberOfSettings[this.quality];

        await lib.setSetting(CONSTANTS.SETTING_KEYS.NUMBER_OF_SETTINGS, currentNumberOfSettings);
        await lib.setSetting(CONSTANTS.SETTING_KEYS.POTATO_LEVEL, this.quality);

        for (let module of modules) {
            for (let [setting, value] of Object.entries(this.current_settings[module])) {
                if (!game.settings.settings.has(`${module}.${setting}`)) {
                    console.warn(`Potato Or Not | Skipped ${module}.${setting} - it is not a registered setting in this version of Foundry or the module is not active`);
                    continue;
                }
                try {
                    await game.settings.set(module, setting, value);
                    console.log(`Potato Or Not | Set ${module}.${setting} to ${value}`);
                } catch (err) {
                    console.error(`Potato Or Not | Could not set ${module}.${setting} to ${value}`);
                }
            }
        }

        //window.location.reload();

    }

    /**
     * Locally prompts the settings dialog
     *
     * @return {FormApplication}    The potato FormApplication
     */
    showDialog() {
        return new PotatoOrNotApplication().render(true);
    }

    get quality() {
        return this._quality;
    }

    /**
     * Sets the graphic quality of the client
     * @param {number}     quality_level  The quality level which to apply
     *
     * @return {boolean}          If the quality level was applied succeeded
     */
    set quality(quality_level) {

        if (typeof quality_level !== 'number') throw new Error("quality must be of type number");
        if (!(quality_level >= 0 && quality_level <= 2)) throw new Error("quality must be 0, 1, or 2");

        this._quality = quality_level;

        this.updateSettings();
    }

    /**
     * Gets the value of a setting of a module at a quality level
     * @param {number} quality_level  The quality level which to get the setting from
     * @param {string} module      The module the setting belongs to
     * @param {string} setting      The setting to get the value from
     *
     * @return {any}          The value of the setting
     */
    getSetting(quality_level = 1, module = "", setting = "") {

        this._validate_setting(quality_level, module, setting);

        return this.settings[quality_level][module][setting];

    }

    /**
     * Adds a setting to be applied on a quality level
     * @param {number}     quality_level  The quality level which to apply the setting to
     * @param {string}     module      The module the setting belongs to
     * @param {string}     setting      The setting to modify
     * @param {any}      value      The value to set
     * @param {boolean}  force      Whether to force-apply the setting right away should the client have the same quality level
     *
     * @return {boolean}          If setting was applied succeeded
     */
    addSetting(quality_level = 1, module = "", setting = "", value = "", force = false) {

        this._validate_quality_level(quality_level);

        if (this.settings[quality_level][module] === undefined) {
            this.settings[quality_level][module] = {};
        }

        this.settings[quality_level][module][setting] = value;

        if (force && this.quality === quality_level) {
            if (!game.settings.settings.has(`${module}.${setting}`)) {
                console.warn(`Potato Or Not | Could not force-apply ${module}.${setting} - it is not a registered setting`);
                return false;
            }
            try {
                game.settings.set(module, setting, value);
                return true;
            } catch (err) {
                console.error(`Potato Or Not | Could not set ${module}.${setting} to ${value} - please see log below`);
                throw err;
            }
        }

        return true;

    }

    /**
     * Removes a setting from a quality level
     * @param {number}     quality_level  The quality level which to apply the setting to
     * @param {string}     module      The module the setting belongs to
     * @param {string}     setting      The setting to modify
     *
     * @return {boolean}          If setting was removed successfully
     */
    removeSetting(quality_level = 1, module = "", setting = "") {

        this._validate_setting(quality_level, module, setting);

        try {
            delete this.settings[quality_level][module][setting];
        } catch (err) {
            console.error(`Potato Or Not | Could not remove ${module}.${setting} - please see log below`);
            throw err;
        }

        return true;

    }

}

class PotatoOrNotApplication extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

    static DEFAULT_OPTIONS = {
        id: "potato-or-not",
        window: {
            title: "PotatoOrNot.Title",
            contentClasses: ["standard-form"],
            icon: "fa-solid fa-potato"
        },
        tag: "form",
        form: {
            handler: PotatoOrNotApplication.myFormHandler,
            submitOnChange: false,
            closeOnSubmit: true
        }
    }

    get title() {
        return game.i18n.localize("PotatoOrNot.Title");
    }

    static PARTS = {
        form: {
            template: `modules/potato-or-not/templates/potato-template.hbs`
        },
    }

    static async myFormHandler(event, form, formData) {
        const level = form.querySelector(`.potato-level-container[active]`)
        if(!level) return;
        const quality = Number(level.getAttribute("level"));
        PotatoOrNot.quality = quality;
        await lib.setSetting(CONSTANTS.SETTING_KEYS.HAS_BEEN_PROMPTED, true);
        await reportStatus({ level: quality, prompted: true, chosenAt: Date.now() });
    }

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        const elements = this.element.querySelectorAll(".potato-level-container")
        for(let element of elements) {
            element.addEventListener("click", this._selectedPotatoLevel.bind(this));
        }
        game.settings.sheet.close();
    }

    _selectedPotatoLevel(event) {
        event.preventDefault();
        for(let element of this.element.querySelectorAll(".potato-level-container")){
            element.removeAttribute('active');
        }
        const btn = event.currentTarget;
        btn.setAttribute('active', true);
    }

    async _prepareContext() {
        return {
            potato_quality: PotatoOrNot.quality,
        }
    }

    /* -------------------------------------------- */

    //
    // /* -------------------------------------------- */
    //
    // /** @override */
    // getData() {
    //     let data = super.getData();
    //     data.potato_quality = this.potato_quality;
    //     return data;
    // }
    //
    // /* -------------------------------------------- */
    //
    // /** @override */
    // activateListeners(html) {
    //     super.activateListeners(html);
    //     let btn = html.find(".potato-level-container");
    //     btn.on("click", this._selectedPotatoLevel.bind(this));
    //     setTimeout(() => this.setPosition(), 50);
    // }
    //
    // /* -------------------------------------------- */
    //
    // _selectedPotatoLevel(event) {
    //     event.preventDefault();
    //     const btn = $(event.currentTarget);
    //     this.potato_quality = Number(btn.attr("level"));
    //     btn.attr('active', true);
    //     this._element.find(".potato-level-container").not(btn).removeAttr("active");
    // }
    //
    // /* -------------------------------------------- */
    //
    // async _updateObject(event, formData) {
    //     PotatoOrNot.quality = this.potato_quality;
    //     lib.setSetting(CONSTANTS.SETTING_KEYS.HAS_BEEN_PROMPTED, true);
    // }

}

/* -------------------------------------------- */
/*  Player Check (GM)                           */
/* -------------------------------------------- */

const STATUS_FLAG = "status";

/**
 * Saves this client's Potato Or Not status on its User, so the GM's Player Check window can show it.
 *
 * @param {object} [changes]   Values to override, e.g. a just-chosen level
 */
async function reportStatus(changes = {}) {
    try {
        const previous = game.user.getFlag(CONSTANTS.MODULE_NAME, STATUS_FLAG) ?? {};
        await game.user.setFlag(CONSTANTS.MODULE_NAME, STATUS_FLAG, {
            ...previous,
            version: game.modules.get(CONSTANTS.MODULE_NAME)?.version ?? "",
            level: lib.getSetting(CONSTANTS.SETTING_KEYS.POTATO_LEVEL),
            prompted: lib.getSetting(CONSTANTS.SETTING_KEYS.HAS_BEEN_PROMPTED),
            seenAt: Date.now(),
            ...changes
        });
    } catch (err) {
        console.warn("Potato Or Not | Could not save this player's status for the GM", err);
    }
}

class PotatoPlayerCheck extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

    static DEFAULT_OPTIONS = {
        id: "potato-or-not-player-check",
        classes: ["potato-player-check"],
        window: {
            title: "PotatoOrNot.PlayerCheck.Title",
            icon: "fa-solid fa-clipboard-check",
            resizable: true
        },
        position: { width: 620, height: "auto" },
        actions: {
            askAgain: PotatoPlayerCheck.#onAskAgain
        }
    }

    static PARTS = {
        main: {
            template: `modules/potato-or-not/templates/player-check.hbs`
        }
    }

    /** Hook id for live refreshes while open. */
    #hookId = null;

    async _prepareContext() {
        const i18n = (key) => game.i18n.localize(key);
        const levels = [i18n("PotatoOrNot.BadTitle"), i18n("PotatoOrNot.MediumTitle"), i18n("PotatoOrNot.GoodTitle")];
        const currentVersion = game.modules.get(CONSTANTS.MODULE_NAME)?.version ?? "";
        const formatTime = (ms) => ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

        const rows = game.users.contents
            .sort((a, b) => (a.isGM - b.isGM) || a.name.localeCompare(b.name))
            .map((user) => {
                const status = user.getFlag(CONSTANTS.MODULE_NAME, STATUS_FLAG);
                let state = "notSeen";
                if (status) state = status.prompted ? "chosen" : "notChosen";
                return {
                    name: user.name,
                    isGM: user.isGM,
                    online: user.active,
                    state,
                    stateLabel: i18n(`PotatoOrNot.PlayerCheck.State.${state}`),
                    level: status?.prompted ? (levels[status.level] ?? "") : "",
                    version: status?.version ?? "",
                    outdated: !!status?.version && status.version !== currentVersion,
                    seenAt: formatTime(status?.seenAt)
                };
            });

        return { rows, onlinePlayers: game.users.filter((u) => u.active && !u.isGM).length };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        if (this.#hookId === null) {
            this.#hookId = Hooks.on("updateUser", (user, changes) => {
                if (foundry.utils.hasProperty(changes, `flags.${CONSTANTS.MODULE_NAME}`) || "active" in changes) this.render();
            });
        }
    }

    _onClose(options) {
        super._onClose(options);
        if (this.#hookId !== null) Hooks.off("updateUser", this.#hookId);
        this.#hookId = null;
    }

    static async #onAskAgain() {
        const round = (lib.getSetting(CONSTANTS.SETTING_KEYS.PROMPT_ROUND) ?? 0) + 1;
        await lib.setSetting(CONSTANTS.SETTING_KEYS.PROMPT_ROUND, round);
        ui.notifications.info(game.i18n.localize("PotatoOrNot.PlayerCheck.AskedAgain"));
    }
}
