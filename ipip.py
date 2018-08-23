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
import pickle
import os
from bs4 import Tag, BeautifulSoup as soup
from prettytable import PrettyTable
from threading import Timer, Thread
from time import sleep
from selenium import webdriver
from selenium.webdriver.common.keys import Keys


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

PATH_COOKIE = "/home/kiri/tmp/"


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


class Rainbow(object):
    """This class is used to print rainbow-like progress animation."""

    def __init__(self, text):
        self.text = text
        self.times = 0
        self.colors = list(
            map(lambda num: "\033[" + str(num) + "m", range(31, 38)))
        self.thread = Thread(target=self.cycle)
        self._running = False

    def cprint(self):
        colored_str = ""
        new_colors = self.colors[self.times %
                                 7:] + self.colors[:self.times % 7]
        for i in range(len(self.text)):
            colored_str += new_colors[i % 7] + self.text[i]
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


def request_ip(url, ip_addr, en=False):
    data = [('ip', ip_addr), ]

    if en:
        response = requests.post(url, headers=HEADERS,
                                 data=data)
        return find_table(response.text)

    cookies = load_cookie()

    if cookies:
        response = requests.post(url, headers=HEADERS,
                                 data=data, cookies=cookies)
        if response.status_code != 200:
            return find_table(selenium_ip(url, ip_addr))
        return find_table(response.text)
    
    return find_table(selenium_ip(url, ip_addr))

def find_table(source):
    sp = soup(source, 'html.parser')
    tables = sp.find_all("table")
    return tables

def create_driver():
    option = webdriver.ChromeOptions()
    option.add_argument("--headless")
    option.add_argument("--host-resolver-rules=MAP www.google-analytics.com 127.0.0.1")
    option.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36')
    return webdriver.Chrome(options=option)

def selenium_ip(url, ip_addr):
    driver = create_driver()
    driver.implicitly_wait(10)
    driver.set_page_load_timeout(10)

    driver.get(url)
    ele = driver.find_element_by_xpath("/html/body/div[2]/form/input")
    if ip_addr:
        ele.clear()
        ele.send_keys(ip_addr)
        ele.send_keys(Keys.ENTER)
    save_cookie(driver)

    return driver.page_source


def save_cookie(driver):
    pickle.dump(driver.get_cookies(), open(PATH_COOKIE + "cookies.pkl", "wb"))

def load_cookie():
    cookies = pickle.load(open(PATH_COOKIE + "cookies.pkl", "rb"))\
        if os.path.exists(PATH_COOKIE + "cookies.pkl") else None

    if cookies:
        cookie_set = dict()
        for cookie in cookies:
            cookie_set[cookie['name']] = cookie['value']
    else:
        return None

    return cookie_set
    

def create_table(rows):
    tables = []
    for row in rows:
        pt = PrettyTable(row[0])
        for item in row[1:]:
            pt.add_row(item)
        tables.append(pt)

    return tables


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

    parser.add_argument('-w', '--webbrowser',
                        action='store_true', dest="browser",
                        help="open https://ipip.net in webbrowser")

    parser.add_argument('-e', '--english',
                        action='store_true', dest="en",
                        help="use en.ipip.net as source. Since Chinese version will challenge visiter now, user -e may make it faster.")

    tables = []

    args = parser.parse_args()

    if args.browser:
        import webbrowser
        webbrowser.open("https://www.ipip.net/ip.html")
        return

    if args.en:
        URL = "https://en.ipip.net/ip.html"
    else:
        URL = "https://www.ipip.net/ip.html"

    rb = Rainbow("已经在努力查询啦")
    rb.start_shining()

    ip_or_domain = domain_ip_parser(
        args.ip_or_domain_or_url, args.local_dns)

    html_tables = request_ip(URL, ip_or_domain)

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
