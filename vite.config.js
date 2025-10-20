export default {
  build: {
    sourcemap: true,
  },
  server: {
    proxy: {
      // 匹配所有以 /geoserver-proxy 开头的请求
      '/geoserver-proxy': {
        // 目标地址是 GeoServer 的根路径
        target: 'https://geoserver.gis.lu.se/geoserver',
        // 必须开启，允许代理目标是 HTTPS
        secure: false,
        // 重写路径，将 /geoserver-proxy 替换为 /geoserver
        // 这样 /geoserver-proxy/wfs... 就会变成 https://geoserver.gis.lu.se/geoserver/wfs...
        rewrite: (path) => path.replace(/^\/geoserver-proxy/, ''),
        // 必须开启，告诉目标服务器这是来自不同域名（解决GeoServer的CORS）
        changeOrigin: true
      },
    },
  },
}
