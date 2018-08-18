#!/usr/bin/python3

"""

　　　　　　 ／. . . . .／. . . . . . . . . . . . /. . . . . . . . . .＼
　　　　　　. . . . . . . . . . . . . . . . . . . . /. .　. │. . . . . .　＼
　　　 　 .′. . . ./ . . . . . . . . . . . . . . |. . . .　.| . . . . . . . . . .
　　　 　 . . . .　/ . . . . . . . . . . . . . . . |. . . .　.|. . . . |. . . . . .|
　　　　 ｉ . . .　.| . . . . . . . . ./ . . . ／ |. . . .　.|. . . . |. . . . .l |
　　　　 | . . .　.| . . . . . . . ./＼ ／ 　 |. . . .　.|、 . . |. . .│|ﾉ
　　　　 |. ./. . .| . . . . . . ./. .／＼_,､八 . . . . | Х. .|. . .│|
　　　　 ∨. ./.ｉ|. . . . . . /l ,.斗午斥 　 ＼. .斗-ミV|. . .│|
　 　 　 ∧. .|l.人|ｉ | . |/　く　rＪ}}￤　　　 ヽ_j丁｝V. ./.∧|
.　　　　|. .j￣＼八| . | 　 　 乂_ツ　　　 　 ﾋツ　〈／./　　　　　
.　　 　 乂. .__,ノ| {_＼ト-　￤ 　 　 　 　 　 , 　 ｉﾄ |／
　　　 ⌒〈`j⌒Y＞r‐ヘ. 　 し　　　　　　 　 　 八
　 　 　 　 ＞‐く_,ノ厶｝:.丶　　 　 （`フ 　　 ／
　　　　　　　　　厂￣＼ 　 　 　 　 　 ,.　イ
　　　　　　　 ／>､.　 　 ＼　　 /≧=（＼
　　　　 　 ／／　 ＼ 　 　 ＼/|　　　|＼＼

"""

__author__ = "Kiri Kira"
__licence__ = "GPL"
__email__ = "kiri_so@outlook.com"
__status__ = "production"

import requests
import argparse
from bs4 import Tag, BeautifulSoup as soup
from prettytable import PrettyTable
from threading import Timer, Thread
from time import sleep

URL = "https://www.ipip.net/ip.html"

HEADERS = {
    'origin': "http://ipip.net",
    'upgrade-insecure-requests': "1",
    'content-type': "application/x-www-form-urlencoded",
    'user-agent': "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36",
    'accept': "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    'referer': "http://ipip.net/ip.html",
    'accept-encoding': "gzip, deflate",
    'accept-language': "zh-CN,zh;q=0.9,en;q=0.8,zh-HK;q=0.7,zh-TW;q=0.6",
    'cache-control': "no-cache"
}


class Extractor(object):
    '''The extractor for parsing HTML tables into python lists.'''

    def __init__(self, table):
        if isinstance(table, Tag):
            self.table = table
        elif isinstance(table, soup):
            self.table = table.find_all("table")
        elif isinstance(table, str):
            self.table = soup(str, 'html.parser').find_all("table")
        else:
            raise Exception('unrecognized type')

        self.output = []

    def parse(self):
        current_row = 0
        for row in self.table.find_all("tr"):
            for cell in row.children:
                if cell.name in ["th", "td"]:

                    body = cell.text
                    self.insert_cell(current_row, body)
            current_row += 1

        return self.output

    def insert_cell(self, row_number, body):
        if len(self.output) <= row_number:
            self.output.append([])
        self.output[row_number].append(body)


def request_ip(ip_addr):
    data = [('ip', ip_addr), ]
    response = requests.post(URL,
                             headers=HEADERS, data=data)
    sp = soup(response.text, 'html.parser')
    tables = sp.find_all("table")
    return tables


def create_table(rows):
    tables = []
    for row in rows:
        pt = PrettyTable(row[0])
        for item in row[1:]:
            pt.add_row(item)
        tables.append(pt)

    return tables

class Rainbow(object):
    """This class is used to print rainbow-like progress anime."""
    def __init__(self, text):
        self.text = text
        self.times = 0
        self.colors = list(map(lambda num: "\033[" + str(num) + "m", range(31, 38)))
        self.thread = Thread(target=self.cycle)
        self._running = False
    
    def cprint(self):
        colored_str = ""
        new_colors = self.colors[self.times%7:] + self.colors[:self.times%7]
        for i in range(len(self.text)):
            colored_str += new_colors[i%7] + self.text[i]
        print(colored_str, end="\r")
        self.times += 1

    def cycle(self):
        while self._running:
            self.cprint()
            sleep(0.1)

    def start_shining(self):
        self._running = True
        self.thread.start()

    def stop_shining(self):
        self._running = False
        print("", end="")


def domain_ip_parser(ip_or_domain_or_url, local_dns):
    """parsing the arg to get the hostname to query."""
    #ip_or_domain_or_url = str(sys.argv[1])
    if ip_or_domain_or_url.startswith("https://") or ip_or_domain_or_url.startswith("http://"):
        ip_or_domain = ip_or_domain_or_url.split('/')[2]
    elif ip_or_domain_or_url == ".":
        ip_or_domain = ""
    else:
        ip_or_domain = ip_or_domain_or_url

    if local_dns:
        import socket
        ip_or_domain = socket.gethostbyname(ip_or_domain)

    return ip_or_domain


def main():

    parser = argparse.ArgumentParser(
        description="A script that helps you to get information via https://ipip.net")

    parser.add_argument('ip_or_domain_or_url', type=str,
                        help="Input the hostname or the url specifices the hostname you want to query. Pass nothing or a dot(.) to query where you are.",
                        default='.', nargs='?')

    parser.add_argument('-l', '--local',
                        action='store_true', dest="local_dns",
                        help="query host in local, and default is on IPIP's server")

    tables = []

    args = parser.parse_args()

    rb = Rainbow("已经在努力查询啦")
    rb.start_shining()

    ip_or_domain = domain_ip_parser(
        args.ip_or_domain_or_url, args.local_dns)

    html_tables = request_ip(ip_or_domain)

    for html_table in html_tables:
        if str(html_table.th.string) == "网络安全风控基础数据" \
                or (html_table.a and str(html_table.a.string)) == "RTBAsia非人类访问量甄别服务":
            continue
        tables.append(Extractor(html_table).parse())

    printable_tables = create_table(tables)

    rb.stop_shining()

    for table in printable_tables:
        print(table)


if __name__ == "__main__":
    main()
