// This scripts fetches the tasks in Infra Oncall Pages (https://app.asana.com/0/62303611729063/list)
// And does some aggregations and pushes the metrics to CSI Dashboards spreadsheet (https://docs.google.com/spreadsheets/d/1M-uj6JpefsTmYjKfTjr_RRfsT6H7NEumKXsf4TyIyh8/edit#gid=569554026) to create On-call metrics
// To run this, you need to create a google script project, update access_token to a avlid API token, and have the run() method triggered daily in the corresponding Google project
// Disclaimer: This is not a clean maintainable code, rather it's a dashboard script that just works. 


function getData(date) {
  
  var access_token = "API_TOKEN"
  
  if (typeof date === "undefined") {
    date = new Date();
  }
  url = 'https://app.asana.com/api/1.0/workspaces/15793206719/tasks/search?projects.any=62303611729063&sort_by=modified_at&opt_fields=id,created_at,modified_at,completed,assignee.name,completed_at,custom_fields,dependencies&limit=100&modified_at.before=' + date.toISOString() + "&access_token=" + access_token;
  Logger.log('created ---- ' + url)
  var response = UrlFetchApp.fetch(url);
  
  var json = response.getContentText();
  var data = JSON.parse(json);
 
  return data;
}



function writeToSheet(sheet, sheet2, startDate) {
  var result = getData();
  var data = result.data;
  var tasks = [];
  var shouldContinue=true
  
  // Load the last 500 tasks
  for (var count=0; count <12; count++) {
      for (var i=0; i < data.length; i++) {
           if (typeof startDate === "undefined") {
             Logger.log('Undefined')
             tasks.push(data[i]);
           } else {
             var onCallRange = getRange2(startDate)
             Logger.log('Check ---- ' + '---' + onCallRange[0] + '---' + onCallRange[1] + '------' + startDate)
             
             if ((new Date(data[i].created_at).getTime() >= onCallRange[0].getTime()) && (new Date(data[i].created_at).getTime() <= onCallRange[1].getTime()) ) {
               tasks.push(data[i]);
             }
           }
      }
    
    Logger.log('Paging ---- ' + '---' + data[data.length-1].gid + '---' + data[data.length-1].modified_at)
    result=getData(new Date(data[data.length-1].modified_at))
    data = result.data
    if (data.length == 0) {
      break;
    }
  }
  
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
  var headers = []
  
  headers.push(['id', 'On-Call Week', 'Created', 'Owner', 'Completed', 'Completed Date','Hours to Complete', 'Time Cost(Hours)', 'Environment', 'Service', 'Impact', 'Reason', 'Hour of Creation', 'Day of Creation','Is Issue'])
  sheet.getRange(sheet.getLastRow()+1, 1, 1, 15).setValues(headers)
  
  for (var i=0; i < tasks.length; i++) {
     var task = tasks[i]
      
     var  created  = new Date(task.created_at)
     var bucket = getRange(created)
     var on_call_week = bucket[0] + '-' + bucket[1]
     var env = ''
     var service = ''
     var impact= ''
     var reason = ''
     var assignee = 'Not Assigned'
     var hoursToComplete = ''
     var cost =''
     
     if (task.dependencies.length>0 ) {
      continue; 
     }
     
     if (task.completed==true) {
       hoursToComplete = diffHours(created, new Date(task.completed_at));
     }
     if (task.assignee!=null) {
       assignee = task.assignee.name
     }
     
     for (var j = 0; j < task.custom_fields.length; j++){
      if (task.custom_fields[j].gid == '1140513829370405' && task.custom_fields[j].enum_value != null){
        env = task.custom_fields[j].enum_value.name 
      }
      if (task.custom_fields[j].gid == '1127651245552975' && task.custom_fields[j].enum_value != null){
        impact = task.custom_fields[j].enum_value.name 
      }      
      if (task.custom_fields[j].gid == '1118971671516049' && task.custom_fields[j].enum_value != null){
        reason = task.custom_fields[j].enum_value.name 
      }
      if (task.custom_fields[j].gid == '1118971671516042' && task.custom_fields[j].enum_value != null){
        service = task.custom_fields[j].enum_value.name 
      }
      if (task.custom_fields[j].gid == '1115835233600749'){
        cost = task.custom_fields[j].number_value
      }
    }
    
     //Logger.log('Task ---- ' + '---' + task.gid + '---' + env + '----' + cost)
     buckets.push([task.gid, on_call_week, created, assignee, task.completed, task.completed_at, hoursToComplete, cost, env, service, impact, reason,created.getHours(), created.getDay(),1])

  }
  sheet.getRange(sheet.getLastRow()+1, 1, buckets.length, 15).setValues(buckets);
  
  
  // Update raw counts
  
  buckets = []
  
  for (var i=0; i < tasks.length; i++) {
     var task = tasks[i]
      Logger.log('Task ---- ' + '---' + task.gid + '---' + task.created_at)
     var  created  = new Date(task.created_at)
     var bucket = getBucket(buckets, created)
     //Logger.log('created ---- ' + created)
     if (bucket == -1) {
         buckets.push(getRange2(created)) 
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
     Logger.log(buckets[i][0] + '---' + buckets[i][1] + '---' + buckets[i][2] + '---' + buckets[i][3])
   }
  headers = []
  headers.push(['Week Start', 'Week End', 'Not Completed', 'Completed'])
  sheet2.getRange(sheet2.getLastRow()+1, 1, 1, 4).setValues(headers)
  sheet2.getRange(sheet2.getLastRow()+1, 1, buckets.length, 4).setValues(buckets);

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
  if (date.getDay()!=2 || (date.getDay()==2 && date.getHours() > 13)) {
     date.setHours(13)
     date.setMinutes(00)
     date.setSeconds(0)
     var subtract = date.getDay()-2
     if (subtract < 0)
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
   //Logger.log('date ---- ' + date1 + '-----' + date1.getDay() +   '-----' +start + '-----' + end)
 return [start.toISOString().split('T')[0], end.toISOString().split('T')[0]]
 
}

function getRange2(date1) {
  var start
  var end
  var date = new Date(date1.getTime())
  if (date.getDay()!=2 || (date.getDay()==2 && (date.getHours() > 13))) {
     date.setHours(13)
     date.setMinutes(00)
     date.setSeconds(0)
     var subtract = date.getDay()-2
     if (subtract < 0)
       subtract=subtract + 7
     start = subtractDays(date, subtract)
     end = addDays(start, 7)
      Logger.log('date22 ---- ' + start + '----'  + end + '---' + date1)
  } else {
    date.setHours(13)
    date.setMinutes(00)
    date.setSeconds(0)
    end = date
    start = subtractDays(end, 7)
    Logger.log('date ---- ' + start + '----'  + end + '---' + date1)
  }
   //Logger.log('date ---- ' + date1 + '-----' + date1.getDay() +   '-----' +start + '-----' + end)
 return [start, end, 0, 0]
 
}

function addDays(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function diffHours(date1, date2){
  //Logger.log('date ---- ' + date1 + '-----' + date2 + '-----' + Math.abs(date2 - date1))
  var diffTime = Math.abs(date2 - date1);
  return Math.ceil(diffTime / (1000 * 60 * 60));
}

function subtractDays(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function run() {
  var spreadsheetId = '1M-uj6JpefsTmYjKfTjr_RRfsT6H7NEumKXsf4TyIyh8';
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName("infra-oncall-raw");
  sheet.clear();
  var sheet2 = SpreadsheetApp.openById(spreadsheetId).getSheetByName("infra-weeks-counts");
  sheet2.clear();
  writeToSheet(sheet, sheet2)  
}

function runLastWeek() {
  var spreadsheetId = '1M-uj6JpefsTmYjKfTjr_RRfsT6H7NEumKXsf4TyIyh8';
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName("infra-oncall-raw-last-week");
  sheet.clear();
  var sheet2 = SpreadsheetApp.openById(spreadsheetId).getSheetByName("infra-weeks-counts-last-week");
  sheet2.clear();
  var d = new Date();
  d.setDate(d.getDate()-7);
  //getRange2(d)
  writeToSheet(sheet, sheet2, d)  
}


