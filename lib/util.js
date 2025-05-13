export const update_bench_time = async (repzo, app_id, key, value) => {
  try {
    const res = await repzo.integrationApp.update(app_id, {
      [`options_formData.${key}`]: value,
    });
  } catch (e) {
    throw e;
  }
};
