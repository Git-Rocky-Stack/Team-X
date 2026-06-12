/**
 * Shared chooser-cap label voice for "select one of N" radio choosers in the
 * workspace feature (theme pickers in create-company-dialog + company-settings).
 *
 * Extracted in sweep Phase 2 (Task 8) per the controller-authorized DRY
 * directive: both surfaces render the identical .cap chooser treatment, so the
 * class strings live here once and are consumed in both places.
 *
 * Night Ops ring-vs-outline cascade rationale (do not "simplify" back to ring):
 * the label wraps a focusable sr-only radio, so the focus indicator must live on
 * the label via `focus-within` (focus-visible on the sr-only input would never
 * surface to sighted users). The `.cap` recipe sets box-shadow via `.dark .cap`
 * (specificity 0,2,0) and `.dark .cap.cap-select` (0,3,0). Tailwind `ring-*` is
 * also box-shadow-based but only (0,1,0), so a ring focus indicator LOSES the
 * cascade fight on cap elements in Night Ops and renders invisible. The OUTLINE
 * form is used instead — `outline` is a separate property and does not compete
 * with box-shadow. Cap elements must therefore never carry ring utilities or
 * `focus-within:outline-none`.
 */

/** Base cap-chooser label voice (selected state adds `cap-select` separately). */
export const chooserCapBase =
  'cap flex-1 cursor-pointer rounded-control px-3 py-2 text-center text-button-sm capitalize';

/** Focus indicator for cap-chooser labels — outline form (see module rationale). */
export const chooserCapFocus =
  'focus-within:outline focus-within:outline-2 focus-within:outline-[hsl(var(--ring))] focus-within:outline-offset-2';
