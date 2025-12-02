const axios = require('axios');
const config = require('../config/env');

const backendClient = axios.create({
    baseURL: config.BACKEND_BASE_URL,
    timeout: 10000
});

backendClient.interceptors.request.use(reqConfig => {
    if (reqConfig.headers.Authorization && !reqConfig.headers.Authorization.startsWith('Bearer ')) {
        reqConfig.headers.Authorization = `Bearer ${reqConfig.headers.Authorization}`;
    }
    return reqConfig;
}, error => Promise.reject(error));

module.exports = backendClient;