import {
  CommandEvent,
  FailedDocsReport,
  NetSuiteClient,
  RepzoClient,
  Result,
  SuiteTalkRESTResponse,
} from "../types";
import Repzo from "repzo";
import { Service } from "repzo/src/types";
import { update_bench_time } from "../util.js";
import axios from "axios";
import OAuth from "oauth-1.0a";
import crypto from "crypto";

const limit = 300;
let offset = 0;

export const addClients = async (
  commandEvent: CommandEvent,
): Promise<Result> => {
  const repzo = new Repzo(commandEvent.app.formData?.repzoApiKey, {
    env: commandEvent.env,
  });

  const commandLog = new Repzo.CommandLog(
    repzo,
    commandEvent.app,
    commandEvent.command,
  );
  try {
    let new_bench_time = new Date().toISOString();
    const bench_time_key = "bench_time_client";
    const bench_time = commandEvent.app.options_formData[bench_time_key] || "";

    let response: SuiteTalkRESTResponse,
      pagination_info: SuiteTalkRESTResponse,
      hasMore: boolean;

    await commandLog.load(commandEvent.sync_id);
    await commandLog
      .addDetail(
        "Repzo Netsuite: Started syncing Netsuite Customers to Repzo...",
      )
      .commit();

    const result: Result = {
      command: commandEvent?.command,
      netsuite_total: 0,
      created: 0,
      updated: 0,
      failed: 0,
      migrated_docs: 0,
    };

    const failed_docs_report: FailedDocsReport = [];

    const oauth = new OAuth({
      consumer: {
        key: commandEvent?.app?.formData?.consumerKey,
        secret: commandEvent?.app?.formData?.consumerSecret,
      },
      realm: commandEvent?.app?.formData?.realm,
      signature_method: "HMAC-SHA256",
      hash_function(base_string, key) {
        return crypto
          .createHmac("sha256", key)
          .update(base_string)
          .digest("base64");
      },
    });

    const token = {
      key: commandEvent?.app?.formData?.tokenKey,
      secret: commandEvent?.app?.formData?.tokenSecret,
    };

    const base_url = `${commandEvent?.app?.formData?.suiteTalkUrl}/services/rest/query/v1/suiteql`;

    const query = {
      q: `SELECT * from customer WHERE lastmodifieddate >= TO_DATE('${bench_time.slice(0, 10)}', 'YYYY-MM-DD')`,
    };

    const request_data = {
      url: `${base_url}?limit=1&offset=${offset}`,
      method: "POST",
    };

    const headers = {
      ...oauth.toHeader(oauth.authorize(request_data, token)),
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: "transient",
    };

    try {
      pagination_info = (
        await axios.post(`${request_data.url}`, query, {
          headers,
        })
      )?.data;

      await commandLog
        .addDetail(
          `${pagination_info?.totalResults} clients changed since ${
            commandEvent.app.options_formData[bench_time_key] || "ever"
          }`,
        )
        .commit();

      hasMore = pagination_info?.hasMore;
      result.netsuite_total = pagination_info?.totalResults;
    } catch (e) {
      failed_docs_report.push({
        method: "fetchingData",
        error_message: `Failed to retrieve data from NetSuite. The server responded with an error: ${e}`,
      });
      console.error(e);
      throw e;
    }

    if (!pagination_info?.items?.length) {
      await commandLog
        .addDetail(
          `All NetSuite customers are up to date with the clients in Repzo. No discrepancies found.`,
        )
        .commit();

      await update_bench_time(
        repzo,
        commandEvent.app._id,
        bench_time_key,
        new_bench_time,
      );

      await commandLog
        .setStatus(
          "success",
          failed_docs_report.length ? failed_docs_report : null,
        )
        .setBody(result)
        .commit();

      return result;
    }

    while (hasMore) {
      const requestUrl = `${base_url}?limit=${limit}&offset=${offset}`;
      const request_data = {
        url: requestUrl,
        method: "POST",
      };
      const headers = {
        ...oauth.toHeader(oauth.authorize(request_data, token)),
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "transient",
      };

      try {
        response = (
          await axios.post(`${request_data.url}`, query, {
            headers,
          })
        )?.data;
      } catch (e) {
        failed_docs_report.push({
          method: "fetchingData",
          error_message: `Failed to retrieve data from NetSuite. The server responded with an error: ${e}. Proceeding to the next page.`,
        });
        console.error(e);
        continue;
      }

      if (!response?.items?.length) {
        break;
      }

      for (let i = 0; i < response?.items?.length; i++) {
        let item: NetSuiteClient = response?.items[i],
          repzo_client: Service.Client.Find.Result;

        try {
          repzo_client = await repzo.client.find({
            client_code: item.id,
          });
        } catch (e) {
          failed_docs_report.push({
            method: "fetchingData",
            error_message: `Failed to retrieve client data from Repzo API for client_code: ${item.id}. Error: ${e.message}`,
          });
          console.error(e);
          continue;
        }
        if (!repzo_client.data.length) {
          // create client
          let client_body: RepzoClient = {
            name: item?.companyname,
            email: item?.email,
            phone: item?.phone,
            client_code: item?.id,
            financials: {
              credit_limit: Number(item?.creditlimit),
            },
            comment: item?.comments,
          };

          try {
            await repzo.client.create(client_body);
            result.created++;
          } catch (e) {
            failed_docs_report.push({
              method: "insert",
              error_message: `Failed to create client in Repzo API for client_code: ${client_body.client_code}. Error: ${e.message}`,
            });
            console.error(e);
            result.failed++;
            continue;
          }
        } else {
          //update client
          let update_client_body: Partial<RepzoClient> = {
            name: item?.companyname,
            email: item?.email,
            phone: item?.phone,
            financials: {
              credit_limit: Number(item?.creditlimit),
            },
            comment: item?.comments,
          };
          try {
            await repzo.client.update(
              repzo_client?.data[0]._id,
              update_client_body,
            );
            result.updated++;
          } catch (e) {
            failed_docs_report.push({
              method: "update",
              error_message: `Failed to update client in Repzo API for client_code: ${repzo_client?.data[0]?.client_code}. Error: ${e.message}`,
            });
            result.failed++;
            console.error(e);
            continue;
          }
        }
      }
      hasMore = response?.hasMore;
      offset += limit;
    }
    result.migrated_docs = result.updated + result.created;

    await commandLog
      .addDetail(`Successfully saved ${result.migrated_docs} clients to Repzo.`)
      .commit();

    await update_bench_time(
      repzo,
      commandEvent.app._id,
      bench_time_key,
      new_bench_time,
    );

    await commandLog
      .setStatus(
        "success",
        failed_docs_report.length ? failed_docs_report : null,
      )
      .setBody(result)
      .commit();

    return result;
  } catch (e) {
    console.error(e?.response?.data || e);
    await commandLog.setStatus("fail", e).commit();
    throw e;
  }
};
