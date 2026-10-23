export function isProhibitedResult(result) {
  const code = result?.code || result?.data?.code;
  const error = String(result?.error || result?.data?.message || '');
  const fieldErrors = result?.fieldErrors || result?.data?.fieldErrors || {};
  return (
    code === 'PROHIBITED_CONTENT' ||
    Object.keys(fieldErrors).some((key) => fieldErrors[key]) ||
    /not allowed on KinBech|prohibited content|adult, violent/i.test(error)
  );
}

export function mergeFieldErrors(result, extra = {}) {
  return {
    ...extra,
    ...(result?.fieldErrors || result?.data?.fieldErrors || {}),
  };
}
