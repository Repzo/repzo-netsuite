import Repzo from "repzo";

export const update_bench_time = async (
  repzo: Repzo,
  app_id: string,
  key: string,
  value: string,
): Promise<void> => {
  try {
    const res = await repzo.integrationApp.update(app_id, {
      [`options_formData.${key}`]: value,
    });
  } catch (e) {
    throw e;
  }
};
