/**
 * @author Adam (charrondev) Charron <adam.c@vanillaforums.com>
 * @copyright 2009-2018 Vanilla Forums Inc.
 * @license https://opensource.org/licenses/GPL-2.0 GPL-2.0
 */

import Keyboard from "quill/modules/keyboard";
import Delta from "quill-delta";
import Emitter from "quill/core/emitter";
import { LineBlot } from "./blots/abstract/WrapperBlot";
import CodeBlockBlot from "./blots/CodeBlockBlot";
import Parchment from "parchment";

export default class KeyboardBindings {

    static MULTI_LINE_BLOTS = ['spoiler-line', 'blockquote-line', 'code-block'];

    bindings = {};

    constructor(quill) {
        this.quill = quill;

        // Keyboard behaviours
        this.resetDefaultBindings();
        this.addBlockNewLineHandlers();
        this.addBlockArrowKeyHandlers();
        this.addBlockBackspaceHandlers();
    }

    /**
     * Nullify the tab key and remove a weird code block binding for consistency.
     * @private
     */
    resetDefaultBindings() {
        // Nullify the tab key.
        this.bindings.tab = false;
        this.bindings["indent code-block"] = false;
        this.bindings["outdent code-block"] = false;
        this.bindings["remove tab"] = false;
        this.bindings["code exit"] = false;
    }

    /**
     * Add custom handlers for backspace inside of Blots.
     * @private
     */
    addBlockBackspaceHandlers() {

        this.bindings["Block Backspace With Selection"] = {
            key: Keyboard.keys.BACKSPACE,
            collapsed: false,
            handler: this.clearFirstPositionMultiLineBlot,
        };

        this.bindings["Block Delete"] = {
            key: Keyboard.keys.BACKSPACE,
            offset: 0,
            collapsed: true,
            format: KeyboardBindings.MULTI_LINE_BLOTS,
            handler: this.handleBlockStartDelete,
        };

        this.bindings["MultiLine Backspace"] = {
            key: Keyboard.keys.BACKSPACE,
            collapsed: true,
            format: ["spoiler-line", "blockquote-line"],
            handler: this.handleMultiLineBackspace,
        };

        this.bindings["CodeBlock Backspace"] = {
            key: Keyboard.keys.BACKSPACE,
            collapsed: true,
            format: ["code-block"],
            handler: this.handleCodeBlockBackspace,
        };
    }

    /**
     * Add keyboard options.bindings that allow the user to escape multi-line blocks with arrow keys.
     * @private
     */
    addBlockArrowKeyHandlers() {
        const commonCriteria = {
            collapsed: true,
            format: KeyboardBindings.MULTI_LINE_BLOTS,
        };

        this.bindings["Block Up"] = {
            ...commonCriteria,
            key: Keyboard.keys.UP,
            handler: this.insertNewlineBeforeRange,
        };

        this.bindings["Block Left"] = {
            ...commonCriteria,
            key: Keyboard.keys.LEFT,
            handler: this.insertNewlineBeforeRange,
        };

        this.bindings["Block Down"] = {
            ...commonCriteria,
            key: Keyboard.keys.DOWN,
            handler: this.insertNewlineAfterRange,
        };

        this.bindings["Block Right"] = {
            ...commonCriteria,
            key: Keyboard.keys.RIGHT,
            handler: this.insertNewlineAfterRange,
        };
    }

    /**
     * Special handling for the ENTER key for Mutliline Blots.
     *
     * @if
     * If there is 1 trailing newline line after the first line,
     * and the user is on the last line,
     * and the user types ENTER,
     *
     * @then
     * Enter a newline after the Blot,
     * move the cursor there,
     * and trim the trailing newlines from the Blot.
     *
     * @param {RangeStatic} range - The range when the enter key is pressed.
     *
     * @returns {boolean} - False to prevent default.
     */
    handleMultilineEnter = (range) => {
        const [line] = this.quill.getLine(range.index);

        const contentBlot = line.getContentBlot();
        if (line !== contentBlot.children.tail) {
            return true;
        }

        const { textContent } = line.domNode;
        const currentLineIsEmpty = textContent === "";
        if (!currentLineIsEmpty) {
            return true;
        }

        const previousLine = line.prev;
        if (!previousLine) {
            return true;
        }

        this.insertNewLineAfterBlotAndTrim(range);

        return false;
    };

    /**
     * Special handling for the ENTER key for Code Blocks.
     *
     * @if
     * If there are 2 tailing newlines after the first line,
     * and the user is on the last line,
     * and the user types ENTER,
     *
     * @then
     * Enter a newline after the Blot,
     * move the cursor there,
     * and trim the trailing newlines from the Blot.
     *
     * @param {RangeStatic} range - The range when the enter key is pressed.
     *
     * @returns {boolean} - False to prevent default.
     */
    handleCodeBlockEnter = (range) => {
        const [line] = this.quill.getLine(range.index);

        const { textContent } = line.domNode;
        const currentLineIsEmpty = /\n\n\n$/.test(textContent);
        if (!currentLineIsEmpty) {
            return true;
        }

        this.insertNewLineAfterBlotAndTrim(range, 2);

        return false;
    };

    /**
     * Add keyboard options.bindings that allow the user to
     * @private
     */
    addBlockNewLineHandlers() {
        this.bindings["MutliLine Enter"] = {
            key: Keyboard.keys.ENTER,
            collapsed: true,
            format: ["spoiler-line", "blockquote-line"],
            handler: this.handleMultilineEnter,
        };

        this.bindings["CodeBlock Enter"] = {
            key: Keyboard.keys.ENTER,
            collapsed: true,
            format: ["code-block"],
            handler: this.handleCodeBlockEnter,
        };
    }

    /**
     * Handle backspacing for multi-line blots.
     *
     * @param {RangeStatic} range - The range that was altered.
     *
     * @returns {boolean} - False to prevent default.
     */
    handleMultiLineBackspace(range) {
        const [ line ] = this.quill.getLine(range.index);

        // Check if this is an empty multi-line blot
        const hasSiblings = line.prev || line.next;

        if (hasSiblings) {
            return true;
        }

        const contentBlot = line.getContentBlot();
        if (contentBlot.domNode.textContent !== "") {
            return true;
        }

        const delta = new Delta()
            .retain(range.index)
            .retain(1, {[line.constructor.blotName]: false});
        this.quill.updateContents(delta, Emitter.sources.USER);
        return false;
    }

    /**
     * Handle backspacing for CodeBlock blots.
     *
     * @param {RangeStatic} range - The range that was altered.
     *
     * @returns {boolean} - False to prevent default.
     */
    handleCodeBlockBackspace(range) {
        const [ line ] = this.quill.getLine(range.index);

        // Check if this is an empty code block.
        const { textContent } = line.domNode;

        if (textContent !== "\n") {
            return true;
        }

        const delta = new Delta()
            .retain(range.index)
            .retain(1, {"code-block": false});
        this.quill.updateContents(delta, Emitter.sources.USER);

        return false;
    }

    /**
     * Strips the formatting from a blot in the first position.
     *
     * @param {Blot} blot - The blot to alter.
     */
    stripFormattingFromFirstBlot = (blot) => {
        const blotName = blot.constructor.blotName;

        const delta = new Delta()
            .retain(blot.length(), { [blotName]: false });
        this.quill.updateContents(delta, Emitter.sources.USER);
    }

    /**
     * Determine if a Blot is the first Blot in the scroll (or first through descendant blots).
     *
     * @example Both of the following are valid.
     *
     * Scroll -> Blot
     * Scroll -> Container -> Container -> Container -> Blot
     *
     * @param {Blot} blot - the blot to check.
     *
     * @returns {boolean} - Whether or not the blot is in the first position.
     */
    isBlotFirstInScroll(blot) {
        const isFirstBlotInBlot = (childBlot, parentBlot) => {
            // Bail out if there are not more children.
            if (!parentBlot.children || !parentBlot.children.head) {
                return false;
            }

            // We found our match.
            if (childBlot === parentBlot.children.head) {
                return true;
            }

            // Recurse through children.
            return isFirstBlotInBlot(childBlot, parentBlot.children.head);
        };

        return isFirstBlotInBlot(blot, this.quill.scroll);
    }

    /**
     * Strips the formatting from the first Blot if it is a block-quote, code-block, or spoiler.
     *
     * @param {RangeStatic} range - The range that was altered.
     *
     * @returns {boolean} - False to prevent default.
     */
    handleBlockStartDelete = (range) => {
        let [line] = this.quill.getLine(range.index);

        if (!this.isBlotFirstInScroll(line)) {
            return true;
        }

        this.stripFormattingFromFirstBlot(line);
        // Return false to prevent default behaviour.
        return false;
    }

    /**
     * Delete the entire first Blot if the whole thing and something else is selected.
     *
     * We want deleting all of the content of the Blot to be different from the deleting the whole document or a large part of it.
     *
     * @param {RangeStatic} range - The range that was altered.
     *
     * @returns {boolean} - False to prevent default.
     */
    clearFirstPositionMultiLineBlot = (range) => {
        const [line] = this.quill.getLine(range.index);
        const selection = this.quill.getSelection();

        const rangeStartsBeforeSelection = range.index < selection.index;
        const rangeEndsAfterSelection = range.index + range.length > selection.index + selection.length;
        const isFirstLineSelected = selection.index === 0;
        const selectionIsEntireScroll = isFirstLineSelected;
        const blotMatches = line instanceof LineBlot
            || line instanceof CodeBlockBlot;

        if ((rangeStartsBeforeSelection || rangeEndsAfterSelection || selectionIsEntireScroll) && blotMatches) {
            let delta = new Delta();

            const newSelection = range;

            if (isFirstLineSelected) {
                delta = delta.insert("\n");
                newSelection.length += 1;
            }

            this.quill.updateContents(delta, Emitter.sources.USER);
            this.quill.setSelection(newSelection);
            this.stripFormattingFromFirstBlot(newSelection);
            this.quill.setSelection(newSelection);
        }

        return true;
    };

    /**
     * Insert a new line at the end of the current Blot and trim excess newlines.
     * @private
     *
     * @param {RangeStatic} range - The range that was altered.
     * @param {number=} deleteAmount - The amount of lines to trim.
     */
    insertNewLineAfterBlotAndTrim(range, deleteAmount = 1) {
        const [line, offset] = this.quill.getLine(range.index);

        const newBlot = Parchment.create("block", "");
        let thisBlot = line;
        if (line instanceof LineBlot) {
            thisBlot = line.getWrapperBlot();
        }

        const nextBlot = thisBlot.next;
        newBlot.insertInto(this.quill.scroll, nextBlot);

        // Now we need to clean up that extra newline.
        const positionUpToPreviousNewline = range.index + line.length() - offset;
        const deleteDelta = new Delta()
            .retain(positionUpToPreviousNewline - deleteAmount)
            .delete(deleteAmount);
        this.quill.updateContents(deleteDelta, Emitter.sources.USER);
        this.quill.setSelection(positionUpToPreviousNewline - deleteAmount, Emitter.sources.USER);
    }

    /**
     * Insert a normal newline before the current range.
     * @private
     *
     * @param {RangeStatic} range - A Quill range.
     *
     * @returns {boolean} false to prevent default.
     */
    insertNewlineBeforeRange(range) {
        // eslint-disable-next-line
        let [line, offset] = this.quill.getLine(range.index);
        const isAtStartOfLine = offset === line.offset();

        if (line instanceof LineBlot) {
            line = line.getWrapperBlot();
        }

        const isFirstBlot = line.parent === line.scroll && line === line.parent.children.head;

        if (isFirstBlot && isAtStartOfLine) {
            // const index = quill.
            const newContents = [
                {
                    insert: "\n",
                },
                ...this.quill.getContents()["ops"],
            ];
            this.quill.setContents(newContents);
        }

        return true;
    }

    /**
     * Insert a normal newline after the current range.
     * @private
     *
     * @param {RangeStatic} range - A Quill range.
     *
     * @returns {boolean} false to prevent default.
     */
    insertNewlineAfterRange(range) {
        // eslint-disable-next-line
        let [line, offset] = this.quill.getLine(range.index);
        const length = line.length();

        // Check that we are at the end of the line.
        const isAtEndOfLine = offset + 1 === length;

        if (line instanceof LineBlot) {
            line = line.getWrapperBlot();
        }

        const isLastBlot = line.parent === line.scroll && line === line.parent.children.tail;

        if (isLastBlot && isAtEndOfLine) {
            // const index = quill.
            const newContents = [
                ...this.quill.getContents()["ops"],
                {
                    insert: "\n",
                },
            ];
            this.quill.setContents(newContents);
            this.quill.setSelection(range.index + 1, 0);
        }

        return true;
    }
}
