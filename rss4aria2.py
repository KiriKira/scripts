import os
import requests
import re
import subprocess
import xmlrpc.client
import time
import json

DEFAULT_HOST = 'localhost'
DEFAULT_PORT = 6800
SERVER_URI_FORMAT = 'http://{}:{:d}/rpc'

class rss4aria2(object):

    def __init__(self,keyword,dir='/home/kiri/桌面',host=DEFAULT_HOST, port=DEFAULT_PORT, session=None):
        self.rssurl = "https://share.dmhy.org/topics/rss/rss.xml?keyword=" + keyword
        self.keyword = keyword
        #self.rpcurl = "http://localhost:6800/jsonrpc"
        #self.jsondic = {
        #    'jsonrpc': '2.0',
        #    'method': 'aria2.addUri',
        #    'param': [[]]
        #}
        self.dir = dir + '/' + keyword
        if not os.path.exists(dir):
            os.system('mkdir ' + dir)
        self.config = {
            'dir' : self.dir,
            'max-connection-per-server' : '16'
        }

        if not os.path.isfile("/home/kiri/rss4aria2/" + keyword + ".json"):
            os.system("touch "+ "/home/kiri/rss4aria2/"  + keyword + ".json")
            os.system("chmod 777 "+ "/home/kiri/rss4aria2/" + keyword + ".json")
            with open("/home/kiri/rss4aria2/" +  keyword + ".json" , "w") as f:
                json.dump({"archive":[]},f)
        with open("/home/kiri/rss4aria2/" + keyword + ".json", "r") as f:
            self.archive = json.load(f)

        self.rssResult = self.parse()
        #self.jsondic['param'].append(self.rssResult)
        if not self.isAria2rpcRunning():
            cmd = 'aria2c' \
                  ' --enable-rpc' \
                  ' --rpc-listen-port %d' \
                  ' --continue' \
                  ' --max-concurrent-downloads=20' \
                  ' --max-connection-per-server=10' \
                  ' --rpc-max-request-size=1024M' % port

            if not session is None:
                cmd += ' --input-file=%s' \
                       ' --save-session-interval=60' \
                       ' --save-session=%s' % (session, session)

            subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE)

            count = 0
            while True:
                if self.isAria2rpcRunning():
                    break
                else:
                    count += 1
                    time.sleep(3)
                if count == 5:
                    raise Exception('aria2 RPC server started failure.')
            print('aria2 RPC server is started.')
        else:
            print('aria2 RPC server is already running.')

        server_uri = SERVER_URI_FORMAT.format(host, port)
        self.server = xmlrpc.client.ServerProxy(server_uri, allow_none=True)

    def isAria2rpcRunning(self):
        pgrep_process = subprocess.Popen('pgrep -l aria2', shell=True, stdout=subprocess.PIPE)

        if pgrep_process.stdout.readline() == b'':
            return False
        else:
            return True

    def addUri(self, uris, options=None, position=None):
        return self.server.aria2.addUri(uris, options, position)

    def parse(self):
        rss = requests.get(self.rssurl)
        magnetFind = re.findall(r'"magnet.*?"',rss.text)
        rssResult = []
        for item in magnetFind:
            rssResult.append(item[1:-1].replace("&amp;","&"))
        return rssResult

    def download(self):
        for url in self.rssResult:
            if url not in self.archive["archive"]:
                self.addUri([url],options=self.config)
                self.archive["archive"].append(url)
            with open("/home/kiri/rss4aria2/" + self.keyword + ".json", "w") as f:
                json.dump(self.archive,f)



if __name__ == '__main__':
    with open("/home/kiri/rss4aria2/config.json","r") as f:
        keywords = json.load(f)
    for keyword in keywords["keyword"]:
        aria = rss4aria2(keyword)
        aria.download()







