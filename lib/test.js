let commandEvent = {
  app: {
    _id: "681c7e860c27707614216c09",
    name: "NetSuite",
    disabled: false,
    available_app: {
      _id: "681c7a84d758ecc3917700bf",
      name: "repzo-netsuite",
      title: "NetSuite",
      description: "Integration between repzo CRM and Oracle NetSuite",
      disabled: false,
      subscription_billing_mode: "free",
      app_category: "681c79a6d758ecc39176feb8",
      commands: [
        {
          command: "add_client",
          name: "Sync Clients",
          description: "",
          group_sync: false,
          _id: "681c7a84d758ecc3917700c0",
        },
      ],
      actions: [],
      createdAt: "2025-05-08T09:33:56.299Z",
      updatedAt: "2025-05-08T09:39:44.618Z",
      __v: 0,
      logo_media: "681c7bc20c277076142167e8",
      JSONSchema: {
        title: "NetSuite Integration Settings",
        type: "object",
        required: [
          "suiteTalkUrl",
          "consumerKey",
          "consumerSecret",
          "tokenKey",
          "tokenSecret",
          "realm",
          "repzoApiKey",
        ],
        properties: {
          repzoApiKey: {
            type: "string",
            title: "Repzo API Key",
          },
          suiteTalkUrl: {
            type: "string",
            title: "NetSuite SuiteTalk Base URL",
            format: "uri",
          },
          consumerKey: {
            type: "string",
            title: "Consumer Key",
          },
          consumerSecret: {
            type: "string",
            title: "Consumer Secret",
          },
          tokenKey: {
            type: "string",
            title: "Token Key",
          },
          tokenSecret: {
            type: "string",
            title: "Token Secret",
          },
          realm: {
            type: "string",
            title: "Realm (Account ID)",
          },
        },
      },
    },
    formData: {
      repzoApiKey: "1nGCt99_yv4zWSH02u30_KhC74nuQeI6-f1r_wfy580",
      suiteTalkUrl: "https://9540558-sb1.suitetalk.api.netsuite.com",
      consumerKey:
        "99b43a31ec0136ef167670112a870b9c2faa9019e5a05584551c56c8ce1be5b3",
      consumerSecret:
        "a756b525125638f0e14b72f59489c7d54a2ec50637fea30735d0ac68a60a8539",
      tokenKey:
        "1ba72f2f22140869df3aeefa83d0e8e30dad59e37a7acc961f14de2090fbbd70",
      tokenSecret:
        "96e887d567a6ce019c79312b916b4d96dfbd69b1bfb71a35561a41fd944791dc",
      realm: "9540558_SB1",
    },
    company_namespace: ["aljomaihtest"],
    options_formData: {
      bench_time_client: "2025-05-10T05:20:40.637Z",
    },
  },
  command: "add_client",
  end_of_day: "04:00",
  nameSpace: ["aljomaihtest"],
  timezone: "Asia/Amman",
  meta: undefined,
  sync_id: "",
  env: "staging",
};
import { Commands } from "./index.js";
Commands(commandEvent);
