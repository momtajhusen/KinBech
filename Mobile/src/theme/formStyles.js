// Single source for form field sizing across the app (the Sell screen is the reference).
export const FORM_ERROR_COLOR = '#E53935';

export function formLabelStyle(colors) {
  return {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  };
}

/** Plain bordered TextInput box. */
export function formInputStyle(colors) {
  return {
    minHeight: 40,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
  };
}

export function formTextareaStyle(colors) {
  return {
    ...formInputStyle(colors),
    minHeight: 64,
    textAlignVertical: 'top',
  };
}

export function formErrorStyle() {
  return {
    color: FORM_ERROR_COLOR,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  };
}

/** Styles for the label + bordered row + TextInput pattern used by FloatingField. */
export function formFieldStyles(colors) {
  return {
    floatingWrap: {
      marginBottom: 10,
    },
    floatingLabel: formLabelStyle(colors),
    floatingInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: colors.border,
    },
    floatingInputRowMultiline: {
      alignItems: 'flex-start',
      paddingTop: 8,
    },
    floatingInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      paddingVertical: 0,
    },
    floatingTextarea: {
      minHeight: 40,
      textAlignVertical: 'top',
    },
    floatingInputError: {
      borderColor: FORM_ERROR_COLOR,
    },
    fieldError: formErrorStyle(),
  };
}
