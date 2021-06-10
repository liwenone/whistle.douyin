const request = require('request')
const fs = require('fs')
const path = require('path')

const TARGET_URL_TOKEN = 'aweme.snssdk.com/aweme/v1/search/item'

let counter = 1
function parse(downloadDir, result) {
  if (!result || !downloadDir) return

  const keyword = result.global_doodle_config.keyword || '未分类'
  const list = result.data

  const videoList = []
  list.forEach(({aweme_info = {}}) => {
    const { desc, video } = aweme_info
    const name = desc || counter++
    const urlList = video && video.play_addr && video.play_addr.url_list

    if (name && urlList) {
      videoList.push({
        name: name.toString().replace(/[\/:*?"<>|]/g, ''),
        urlList,
      })
    }
  })

  if (videoList.length) {
    const keywordDir = path.resolve(downloadDir, keyword)
    const exist = fs.existsSync(keywordDir)
    if (!exist) {
      fs.mkdirSync(keywordDir)
    }

    videoList.forEach((item) => {
      const name = `${item.name}.mp4`
      const videoPath = path.resolve(keywordDir, name)

      const exist = fs.existsSync(videoPath)
      if (!exist) {
        download(item.urlList, videoPath, name, 0)
      }
    })
  }
}


function download(urlList, videoPath, name, retryTime) {
  if (retryTime >= urlList.length) {
    console.log('下载失败：', name)
  } else {
    if (retryTime == 0) {
      console.log('开始下载：', name)
    } else {
      console.log(`重试${retryTime}：`, name)
    }

    const url = urlList[retryTime]
    const stream = fs.createWriteStream(videoPath)

    request(url).pipe(stream)
    .on('close', () => {
      console.log('下载完成：', name)
    })
    .on('error', (err) => {
      console.log(err)
      download(urlList, videoPath, name, retryTime+1)
    })
  }
}


module.exports = (server) => {
  server.on('request', (req, res) => {
    const { url, ruleValue } = req.originalReq

    const isTarget = url.includes(TARGET_URL_TOKEN)
    if (isTarget) {
      delete req.headers['accept-encoding']
      const client = req.request((out) => {
        delete out.headers['content-length']
        res.writeHead(out.statusCode, out.headers)

        let body
        out.on('data', (chunk) => {
          res.write(chunk)
          body = body ? Buffer.concat([body, chunk]) : chunk
        })
        out.on('end', () => {
          res.end()
          if (body) {
            try {
              const downloadDir = ruleValue.replace('downloadDir=', '')
              const result = JSON.parse(body.toString())
              parse(downloadDir, result)
            } catch (err) {
              console.log(err)
            }
          }
        })
      })
      req.pipe(client)
    } else {
      req.passThrough()
    }
  })
}