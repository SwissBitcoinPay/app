const webpack = require("webpack");
const path = require("path");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const dotenv = require("dotenv");
const LodashModuleReplacementPlugin = require("lodash-webpack-plugin");

const isDevelopment = process.env.NODE_ENV === "development";

// Module rules

const babelLoaderConfiguration = {
  test: /\.[jt]sx?$/,
  include: [
    path.resolve(__dirname, "./src"),
    path.resolve(
      __dirname,
      "node_modules/react-native-animated-linear-gradient"
    ),
    path.resolve(__dirname, "node_modules/@react-native-community/slider"),
    path.resolve(__dirname, "node_modules/react-native-keychain"),
    path.resolve(__dirname, "node_modules/react-native-picker-select"),
    path.resolve(__dirname, "node_modules/@dotlottie"),
    path.resolve(__dirname, "node_modules/react-native-screenguard"),
    path.resolve(__dirname, "node_modules/react-native-qrcode-svg"),
    path.resolve(__dirname, "node_modules/react-native-progress"),
    path.resolve(__dirname, "node_modules/react-native-error-boundary")
  ],
  exclude: [/\.native.[jt]sx$/, /\.ios.[jt]sx$/, /\.android.[jt]sx$/],
  use: {
    loader: "babel-loader",
    options: {
      cacheDirectory: true,
      // The 'metro-react-native-babel-preset' preset is recommended to match React Native's packager
      presets: ["module:@react-native/babel-preset"],
      plugins: [
        "react-native-web",
        isDevelopment && "react-refresh/babel"
      ].filter(Boolean)
    }
  }
};

const assetLoaderConfiguration = {
  test: /\.(ico|png|jpe?g|gif|ttf|woff2|svg|mp4|lottie)$/i,
  type: "asset/resource"
};

const cssLoaderConfiguration = {
  test: /\.css$/i,
  use: ["style-loader", "css-loader"]
};

// Plugins

const HTMLWebpackPlugin = new HtmlWebpackPlugin({
  template: path.resolve(__dirname, "./public/index.html"),
  filename: "index.html"
});

const defineEnvVariablesPlugin = new webpack.DefinePlugin({
  "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
  "process.env.COMMIT_REF": JSON.stringify(process.env.COMMIT_REF),
  __DEV__: process.env.NODE_ENV !== "production"
});

const providePlugin = new webpack.ProvidePlugin({
  process: "process/browser",
  Buffer: ["buffer", "Buffer"]
});

const ignorePlugin = new webpack.IgnorePlugin({
  checkResource(resource) {
    return /.*\/wordlists\/(?!english).*\.json/.test(resource);
  }
});

module.exports = {
  entry: path.resolve(__dirname, "./src/index.js"),

  output: {
    path: path.resolve(__dirname, "build"),
    filename: "[name].js",
    publicPath: "/"
  },

  devtool: isDevelopment ? "eval" : "nosources-source-map",
  context: __dirname,
  mode: process.env.NODE_ENV,
  optimization: {
    splitChunks: {
      chunks: "all"
    }
  },

  devServer: {
    static: {
      directory: path.resolve(__dirname, "public")
    },
    server: "https",
    compress: true,
    open: true,
    port: process.env.API_PORT || 7474,
    historyApiFallback: true,
    hot: true
  },

  plugins: [
    HTMLWebpackPlugin,
    defineEnvVariablesPlugin,
    providePlugin,
    ignorePlugin,
    isDevelopment && new ReactRefreshWebpackPlugin()
  ].filter(Boolean),

  module: {
    rules: [
      babelLoaderConfiguration,
      assetLoaderConfiguration,
      cssLoaderConfiguration,
      {
        test: /\.node$/,
        loader: "node-loader"
      }
    ]
  },

  resolve: {
    fallback: {
      buffer: require.resolve("buffer")
    },
    extensions: [
      ".web.tsx",
      ".web.jsx",
      ".web.ts",
      ".web.js",
      ".tsx",
      ".jsx",
      ".ts",
      ".js"
    ],
    alias: {
      "styled-components": "styled-components/native",
      "react-native$": "react-native-web",
      "react-native-linear-gradient": "react-native-web-linear-gradient",
      crypto: "crypto-browserify",
      path: "path-browserify",
      vm: "vm-browserify",
      stream: "stream-browserify"
    }
  },
  experiments: {
    asyncWebAssembly: true
  }
};
