#!/usr/bin/python3

import requests
import sys
from bs4 import Tag, BeautifulSoup as soup
from prettytable import PrettyTable

url = "https://www.ipip.net/ip.html"

headers = {
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


'''
def request_ip(ip_addr):
    data = [('ip', ip_addr),]
    response = requests.post('http://ipip.net/ip.html', headers=headers, data=data)
    sp = soup(response.text, 'html.parser')
    tables = sp.find_all("table")

    row1_1 = list(map(lambda item: str(item.string), tables[0].find_all("td")[0:3:2]))
    row1_2 = list(map(lambda item: str(item.string), tables[0].find_all("td")[1:4:2]))
    row1 = []

    for i in range(2):
        row1.append([row1_1[i], row1_2[i]])

    row2_1 = list(map(lambda item: str(item.string), tables[1].find_all("th")))
    try:
        row2_2 = list(map(lambda item: str(item.string), tables[1].find_all("td")))
    except Exception:
        row2_2 = None

    row2 = [row2_1, row2_2]

    row3_1 = list(map(lambda item: str(item.string), tables[2].find_all("th")))
    row3_2 = list(map(lambda item: str(item)[4:-5].replace("<br/>", "\n"), tables[2].find_all("td")))

    row3 = [row3_1, row3_2]

    return row1, row2, row3
'''


def request_ip(ip_addr):
    data = [('ip', ip_addr), ]
    response = requests.post(url,
                             headers=headers, data=data)
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


def main():
    #ip_or_domain_or_url = "1.1.1.1"
    ip_or_domain_or_url = str(sys.argv[1])
    if ip_or_domain_or_url.startswith("https://") or ip_or_domain_or_url.startswith("http://"):
        ip_or_domain = ip_or_domain_or_url.split('/')[2]
    else:
        ip_or_domain = ip_or_domain_or_url

    tables = []

    html_tables = request_ip(ip_or_domain)

    for html_table in html_tables:
        if str(html_table.th.string) == "网络安全风控基础数据" \
                or (html_table.a and str(html_table.a.string)) == "RTBAsia非人类访问量甄别服务":
            continue
        tables.append(Extractor(html_table).parse())

    printable_tables = create_table(tables)

    for table in printable_tables:
        print(table)


if __name__ == "__main__":
    main()
