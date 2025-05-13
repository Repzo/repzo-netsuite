import {
  CommandEvent,
  FailedDocsReport,
  NetSuiteClient,
  RepzoClient,
  RepzoClientCreateBody,
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
    const company_namespace = commandEvent.nameSpace.join("_");
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

    const query =
      bench_time === ""
        ? {
            q: `SELECT * from customer `,
          }
        : {
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

    result.netsuite_total = pagination_info?.totalResults;

    let netsuite_customers: Pick<
      NetSuiteClient,
      | "id"
      | "companyname"
      | "altname"
      | "phone"
      | "email"
      | "comments"
      | "creditlimit"
      | "lastmodifieddate"
      | "entityid"
    >[] = [];

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

      netsuite_customers.push(
        ...response.items.map((customer) => {
          return {
            id: customer.id,
            companyname: customer.companyname,
            altname: customer.altname,
            phone: customer.phone,
            email: customer.email,
            comments: customer.comments,
            creditlimit: customer.creditlimit,
            lastmodifieddate: customer.lastmodifieddate,
            entityid: customer.entityid,
          };
        }),
      );

      hasMore = response?.hasMore;
      offset += limit;
    }

    let repzo_clients = await getRepzoClients(repzo, failed_docs_report);

    repzo_clients = repzo_clients?.filter(
      (repzo_client) => repzo_client?.integration_meta?.id !== undefined,
    );

    for (let i = 0; i < netsuite_customers.length; i++) {
      let netsuite_customer = netsuite_customers[i];
      let existent_repzo_client = repzo_clients.find(
        (repzo_client) =>
          repzo_client.integration_meta.id ===
          `${company_namespace}_${netsuite_customer.id}`,
      );
      if (existent_repzo_client) {
        // update client
        if (
          new Date(netsuite_customer.lastmodifieddate) >
          new Date(existent_repzo_client?.integration_meta?.netsuite_last_sync)
        ) {
          let client_update_body: Partial<RepzoClientCreateBody> = {
            name: netsuite_customer?.companyname || netsuite_customer?.altname,
            email: netsuite_customer?.email,
            phone: netsuite_customer?.phone,
            comment: netsuite_customer?.comments,
            integration_meta: {
              netsuite_last_sync: new Date().toISOString(),
            },
            financials: {
              credit_limit: Number(netsuite_customer?.creditlimit),
            },
          };
          try {
            await repzo.client.update(
              existent_repzo_client._id,
              client_update_body,
            );
            result.updated++;
          } catch (e) {
            console.error(e);
            result.failed++;
            failed_docs_report.push({
              method: "insert",
              error_message: `Failed to update client in Repzo API for NetSuite customer with ID: ${netsuite_customer.id}. Error: ${e.message}`,
            });
          }
        }
      } else {
        // create client
        let create_body: RepzoClientCreateBody = {
          name: netsuite_customer?.companyname || netsuite_customer?.altname,
          email: netsuite_customer?.email,
          phone: netsuite_customer?.phone,
          comment: netsuite_customer?.comments,
          client_code: `${netsuite_customer.id}-${netsuite_customer?.entityid}`,
          integration_meta: {
            id: `${company_namespace}_${netsuite_customer?.id}`,
            netsuite_id: netsuite_customer?.id,
            netsuite_last_sync: new Date().toISOString(),
          },
          financials: {
            credit_limit: Number(netsuite_customer?.creditlimit),
          },
        };
        try {
          await repzo.client.create(create_body);
          result.created++;
        } catch (e) {
          console.error(e);
          result.failed++;
          failed_docs_report.push({
            method: "insert",
            error_message: `Failed to create client in Repzo API for NetSuite customer with ID: ${netsuite_customer.id}. Error: ${e.message}`,
          });
        }
      }
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

const getRepzoClients = async (
  repzo: Repzo,
  failed_docs_report: FailedDocsReport,
): Promise<RepzoClient[]> => {
  try {
    let repzo_clients: RepzoClient[] = [],
      per_page = 300,
      pagination_info: Service.Client.Find.Result,
      clients: Service.Client.Find.Result;

    try {
      pagination_info = await repzo.client.find({
        per_page: 1,
        page: 1,
      });
    } catch (e) {
      failed_docs_report.push({
        method: "fetchingData",
        error_message: `Failed to retrieve client data from Repzo API on page 1. Error: ${e.message}`,
      });
      console.error(e);
      throw e;
    }

    const num_pages = Math.ceil(pagination_info.total_result / per_page);

    for (let i = 1; i <= num_pages; i++) {
      try {
        clients = await repzo.client.find({
          per_page,
          page: i,
        });
        repzo_clients.push(
          ...clients?.data?.map((client) => {
            return {
              _id: client._id,
              integration_meta: {
                id: client.integration_meta.id,
                netsuite_id: client.integration_meta.netsuite_id,
                netsuite_last_sync: client.integration_meta.netsuite_last_sync,
              },
            };
          }),
        );
      } catch (e) {
        failed_docs_report.push({
          method: "fetchingData",
          error_message: `Failed to retrieve client data from Repzo API on page ${i}. Error: ${e.message}. Proceeding to the next page.`,
        });
        console.error(e);
        continue;
      }
    }
    return repzo_clients;
  } catch (e) {
    console.error(e);
    throw e;
  }
};
