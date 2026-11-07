// Voice control of the sell screens: each screen lists what can be tapped right now as controls
// ({ id, kind, label, options?, value?, later?, run(value) }); the voice helper's answer runs them.
// `later` controls (they close, post, clear or leave) run only after the spoken reply ends.

/** Controls as the AI sees them (no handlers). */
export const describeControls = (controls) =>
  controls.map(({ id, kind, label, options, value }) => ({
    id,
    kind,
    label,
    ...(options ? { options } : {}),
    ...(value !== undefined ? { value } : {}),
  }));

/** The item details for the AI: the open card's live values, else what is saved for this photo. */
export function detailsForVoice(step, readSaved) {
  if (step.open) {
    return {
      open: true,
      label: step.details.label,
      fields: step.details.fields.map((field) => ({ ...field, value: step.values[field.key] || '' })),
    };
  }
  if (!step.known) return null;
  const saved = readSaved(step.known);
  return {
    open: false,
    label: step.known.label,
    fields: step.known.fields.map((field) => ({ ...field, value: saved[field.key] || '' })),
  };
}

/**
 * Runs one voice answer: `when` "now" (while it speaks: fill, open, choose) or "later" (after it:
 * save, post and the `later` controls). Returns true when something ran.
 */
export function runVoiceTurn(turn, when, screen) {
  const { controls, applySet, detailsStep, savedDetails = {}, pending, answerCheck, confirmOpen, openPublish, closePublish, confirmPublish } = screen;
  let ran = false;
  // With the card closed, only a value that differs from the saved one is a change.
  const changed = Object.entries(turn.details || {}).filter(
    ([key, value]) => detailsStep.open || String(savedDetails[key] || '') !== String(value)
  );
  const details = changed.length ? Object.fromEntries(changed) : null;

  if (when === 'now') {
    applySet(turn.set || {}, turn.descriptionAdd || '');
    // A changed detail opens the card with the new value, the way the seller would edit it by hand.
    if (details || (turn.actions || []).some((action) => action.id === 'edit_details')) detailsStep.edit(details);
    if (turn.check && pending) {
      const alt = typeof turn.check === 'string' && turn.check.startsWith('alt:');
      const choice = alt ? pending.suggestion.alternatives?.[Number(turn.check.slice(4))] : turn.check;
      if (choice) answerCheck(choice);
    }
    // "Publish kar do" from the form opens the review now and posts once the reply is said.
    if ((turn.publish === 'open' || turn.publish === 'confirm') && !confirmOpen) openPublish();
    if (turn.publish === 'cancel' && confirmOpen) closePublish();
  } else {
    if (turn.detailsDone && (detailsStep.open || detailsStep.openRef.current)) {
      if (turn.detailsDone === 'save') detailsStep.save(turn.details);
      else detailsStep.skip();
      ran = true;
    }
    if (turn.publish === 'confirm' && confirmOpen) {
      confirmPublish();
      ran = true;
    }
  }

  (turn.actions || []).forEach((action) => {
    if (action.id === 'edit_details') return;
    const control = controls.find((item) => item.id === action.id);
    if (!control || Boolean(control.later) !== (when === 'later')) return;
    control.run(action.value);
    ran = true;
  });
  return when === 'later' ? ran : true;
}
