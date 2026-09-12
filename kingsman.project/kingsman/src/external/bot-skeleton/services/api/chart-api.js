import { generatePublicDerivApiInstance } from "./appId";

class ChartAPI {
  api;
  time_interval;

  onsocketclose() {
    this.stopTime();
    this.reconnectIfNotConnected();
  }

  init = async (force_create_connection = false) => {
    if (!this.api || force_create_connection) {
      if (this.api?.connection) {
        this.api.disconnect();
        this.api.connection.removeEventListener(
          "close",
          this.onsocketclose.bind(this),
        );
      }

      this.api = await generatePublicDerivApiInstance();
      this.api?.connection.addEventListener(
        "close",
        this.onsocketclose.bind(this),
      );
    }
    this.getTime();
  };

  getTime() {
    if (!this.time_interval) {
      this.time_interval = setInterval(() => {
        this.api.send({ time: 1 });
      }, 30000);
    }
  }

  stopTime() {
    if (this.time_interval) {
      clearInterval(this.time_interval);
      this.time_interval = null;
    }
  }

  reconnectIfNotConnected = () => {
    // eslint-disable-next-line no-console
    console.log("chart connection state: ", this.api?.connection?.readyState);

    if (
      this.api?.connection?.readyState &&
      this.api?.connection?.readyState > 1
    ) {
      // eslint-disable-next-line no-console
      console.log(
        "Info: Chart connection to the server was closed, trying to reconnect.",
      );
      this.init(true);
    }
  };
}

const chart_api = new ChartAPI();

export default chart_api;
