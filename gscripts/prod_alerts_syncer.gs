// This scripts fetches the tasks in Production Alerts (https://app.asana.com/0/29757273592178/list)
// And does some aggregations and pushes the metrics to CSI Dashboards spreadsheet (https://docs.google.com/spreadsheets/d/1M-uj6JpefsTmYjKfTjr_RRfsT6H7NEumKXsf4TyIyh8/edit#gid=569554026) to create On-call metrics
// To run this, you need to create a google script project, update access_token to a avlid API token, and have the run() method triggered daily in the corresponding Google project
// Disclaimer: This is not a clean maintainable code, rather it's a dashboard script that just works. 


function getData(date) {
  
   var access_token = "YOUR_TOKEN"
   
  if (typeof date === "undefined") {
    date = new Date();
  }
  url = 'https://app.asana.com/api/1.0/workspaces/15793206719/tasks/search?projects.any=29757273592178&sort_by=modified_at&opt_fields=id,created_at,modified_at,completed,assignee,completed_at,custom_fields,dependencies&limit=100&modified_at.before=' + date.toISOString() + "&access_token=" + access_token;
  Logger.log('created ---- ' + url)
  var response = UrlFetchApp.fetch(url);
  
  var json = response.getContentText();
  var data = JSON.parse(json);
 
  return data;
}

function writeToSheet(sheet) {
  var result = getData();
  var data = result.data;
  var tasks = [];
  var shouldContinue=true
  
  // Load the last 3000 tasks
  for (var count=0; count < 100; count++) {
      for (var i=0; i < data.length; i++) {
        if (new Date(data[i].created_at).getYear()>=2019) {
            //shouldContinue=false 
          tasks.push(data[i]);
        }
           
      }
    Logger.log('Paging ---- ' + '---' + data[data.length-1].gid + '---' + data[data.length-1].modified_at)
    Utilities.sleep(100)
    result=getData(new Date(data[data.length-1].modified_at))
    data = result.data
  }
  
  // sort tasks
    // sort tasks
   for (var i=0; i < tasks.length-1; i++) {
     for (j=0; j<tasks.length-i-1; j++) {
       if (tasks[j+1].created_at > tasks[j].created_at) {
        var tmp = tasks[j]
        tasks[j]= tasks[j+1]
        tasks[j+1]=tmp
       }
     }
   }
     
  

  var buckets = []
  
  for (var i=0; i < tasks.length; i++) {
     var task = tasks[i]
       if (task.dependencies.length>0 ) {
          Logger.log('Skiping task ---- ' + '---' + task.gid + '---' + task.dependencies)
      continue; 
     }
     
     var  created  = new Date(task.created_at)
     var bucket = getBucket(buckets, created)
     //Logger.log('created ---- ' + created)
     if (bucket == -1) {
         buckets.push(getRange(created)) 
         bucket = buckets.length-1
     }
    
      var completed = buckets[bucket][3]
      var total = buckets[bucket][2]
      //Logger.log('completed ---- ' + '---' + task.gid + '---' + task.completed_at)
      if (task.completed === true) {
           completed++
      } else {
        total++
      }
    
     buckets[bucket] = [buckets[bucket][0], buckets[bucket][1], total, completed]  

  }
   for (var i=0; i < buckets.length; i++) {
     //Logger.log(buckets[i][0] + '---' + buckets[i][1] + '---' + buckets[i][2] + '---' + buckets[i][3])
   }
  var headers = []
  headers.push(['Week Start', 'Week End', 'Not Completed', 'Completed'])
  sheet.getRange(sheet.getLastRow()+1, 1, 1, 4).setValues(headers)
  sheet.getRange(sheet.getLastRow()+1, 1, buckets.length, 4).setValues(buckets);

} 

function getBucket(buckets, date) {
 for (var i=0; i < buckets.length; i++) {
   if (date <= buckets[i][1] && date >=buckets[i][0]) {
     return i
   }
 }
  return -1
  
}

function getRange(date1) {
  var start
  var end
  var date = new Date(date1.getTime())
  if (date.getDay!=2 || (date.getDay==2 && date.getHours() < 13)) {
     date.setHours(13)
     date.setMinutes(00)
     date.setSeconds(0)
     var subtract = date.getDay()-2
     if (subtract < 1)
       subtract=subtract + 7
     start = subtractDays(date, subtract)
     end = addDays(start, 7)
  } else {
    date.setHours(13)
    date.setMinutes(00)
    date.setSeconds(0)
    end = date
    start = subtractDays(end, 7)
  }
 return [start, end, 0, 0]
 
}

function addDays(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function subtractDays(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function run() {
  var spreadsheetId = '1M-uj6JpefsTmYjKfTjr_RRfsT6H7NEumKXsf4TyIyh8';
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName("raw");
  sheet.clear();
  writeToSheet(sheet)  
}

